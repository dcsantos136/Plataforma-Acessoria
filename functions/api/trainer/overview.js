import { reply, requireUser } from "../../_lib/auth.js";
export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env, "treinador(a)");
  if (error) return error;
  const id = user.user_id, today = new Date().toISOString().slice(0, 10);
  const [athletes, upcoming, completed, feedback, volume, workouts] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM trainer_athletes WHERE trainer_id=? AND status='active'").bind(id).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM workouts WHERE trainer_id=? AND workout_date>=? AND workout_date<date(?,'+7 day') AND status IN ('planned','released')").bind(id,today,today).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM workouts WHERE trainer_id=? AND workout_date>=date(?,'-6 day') AND workout_date<=? AND status='completed'").bind(id,today,today).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM workout_feedback f JOIN workouts w ON w.id=f.workout_id WHERE w.trainer_id=? AND f.coach_seen_at IS NULL").bind(id).first(),
    env.DB.prepare("SELECT COALESCE(SUM(distance_km),0) AS km FROM workouts WHERE trainer_id=? AND workout_date>=date(?,'-6 day') AND workout_date<=? AND status='completed'").bind(id,today,today).first(),
    env.DB.prepare("SELECT w.id,w.workout_date,w.modality,w.title,w.prescription,w.status,w.distance_km,w.duration_minutes,u.name AS athlete_name FROM workouts w JOIN users u ON u.id=w.athlete_id WHERE w.trainer_id=? AND w.workout_date>=? ORDER BY w.workout_date,w.created_at LIMIT 8").bind(id,today).all()
  ]);
  return reply({stats:{athletes:Number(athletes?.n||0),upcoming:Number(upcoming?.n||0),completed:Number(completed?.n||0),pendingFeedback:Number(feedback?.n||0),km:Number(volume?.km||0)},workouts:workouts.results||[],today});
}
