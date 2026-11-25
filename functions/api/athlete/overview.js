import { reply, requireUser } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const { user, error } = await requireUser(request, env, "atleta");
  if (error) return error;

  const id = user.user_id;
  const today = new Date().toISOString().slice(0, 10);
  const [upcoming, completed, minutes, distance, next, recent, coach] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM workouts WHERE athlete_id=? AND status='released' AND workout_date>=?").bind(id, today).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM workouts WHERE athlete_id=? AND status='completed' AND workout_date>=date(?,'-6 day') AND workout_date<=?").bind(id, today, today).first(),
    env.DB.prepare("SELECT COALESCE(SUM(duration_minutes),0) AS n FROM workouts WHERE athlete_id=? AND status='completed' AND workout_date>=date(?,'-6 day') AND workout_date<=?").bind(id, today, today).first(),
    env.DB.prepare("SELECT COALESCE(SUM(distance_km),0) AS n FROM workouts WHERE athlete_id=? AND status='completed' AND workout_date>=date(?,'-6 day') AND workout_date<=?").bind(id, today, today).first(),
    env.DB.prepare("SELECT w.id,w.workout_date,w.modality,w.title,w.prescription,w.duration_minutes,w.distance_km,w.status,u.name AS trainer_name FROM workouts w JOIN users u ON u.id=w.trainer_id WHERE w.athlete_id=? AND w.status='released' AND w.workout_date>=? ORDER BY w.workout_date,w.created_at LIMIT 1").bind(id, today).first(),
    env.DB.prepare("SELECT w.id,w.workout_date,w.modality,w.title,w.duration_minutes,w.distance_km,w.status FROM workouts w WHERE w.athlete_id=? AND w.status IN ('completed','missed') ORDER BY w.workout_date DESC,w.created_at DESC LIMIT 5").bind(id).all(),
    env.DB.prepare("SELECT u.name FROM trainer_athletes ta JOIN users u ON u.id=ta.trainer_id WHERE ta.athlete_id=? AND ta.status='active' ORDER BY ta.created_at LIMIT 1").bind(id).first(),
  ]);

  return reply({
    stats: {
      upcoming: Number(upcoming?.n || 0),
      completed: Number(completed?.n || 0),
      minutes: Number(minutes?.n || 0),
      km: Number(distance?.n || 0),
    },
    nextWorkout: next || null,
    recent: recent.results || [],
    trainerName: coach?.name || null,
    today,
  });
}
