use chrono;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::State;
use thiserror::Error;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------
#[derive(Debug, Error)]
pub enum FlightFocusError {
    #[error("serialization error: {0}")]
    Serialization(String),
    #[error("storage error: {0}")]
    Storage(String),
    #[error("invalid session state transition: {0}")]
    InvalidTransition(String),
    #[error("not running")]
    NotRunning,
    #[error("no session in progress")]
    NoSessionInProgress,
}

impl Serialize for FlightFocusError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Idle,
    Takeoff,
    Cruise,
    Touchdown,
    Rest,
}

impl Phase {
    pub fn as_str(&self) -> &'static str {
        match self {
            Phase::Idle => "idle",
            Phase::Takeoff => "takeoff",
            Phase::Cruise => "cruise",
            Phase::Touchdown => "touchdown",
            Phase::Rest => "rest",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AudioMode {
    WhiteNoise,
    BrownNoise,
    CabinHum,
    BinauralBeats {
        #[serde(rename = "frequencyHz", alias = "frequency_hz")]
        frequency_hz: u32,
        brainwave: String,
    },
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: String,
    pub started_at: String, // ISO-8601
    pub ended_at: Option<String>,
    pub phase: Phase,
    pub duration_seconds: i64,
    pub completed: bool,
    pub audio_mode: AudioMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusSession {
    pub id: String,
    pub phase: Phase,
    pub started_at: String,
    pub total_duration_seconds: i64,
    pub remaining_seconds: i64,
    pub completed: bool,
    pub audio: AudioMode,
    pub last_heartbeat: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub session_id: String,
    pub completed: bool,
    pub duration_seconds: i64,
    pub phase: Phase,
    pub ended_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionRequest {
    pub duration_seconds: i64,
    pub audio_mode: Option<AudioMode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusStats {
    pub total_sessions: i64,
    pub total_minutes: i64,
    pub current_streak: i32,
    pub longest_streak: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JourneyState {
    #[serde(alias = "departure_code")]
    pub departure_code: String,
    #[serde(alias = "destination_code")]
    pub destination_code: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AchievementId {
    FirstFlight,
    TenFlights,
    HourFlown,
    WeekStreak,
    RoutePlanner,
    GlobeTrotter,
    LongHaul,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockedAchievement {
    pub id: AchievementId,
    pub unlocked_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementStatus {
    pub id: AchievementId,
    pub title: String,
    pub description: String,
    pub icon: String,
    pub unlocked: bool,
    pub unlocked_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusExportBundle {
    pub version: u32,
    pub exported_at: String,
    pub sessions: Vec<SessionRecord>,
    pub journey: Option<JourneyState>,
    pub achievements: Vec<UnlockedAchievement>,
    pub destination_history: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub sessions_added: usize,
    pub achievements_added: usize,
    pub journey_updated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SessionCommand {
    Pause,
    Resume,
    Skip,
    Reset,
}

// ---------------------------------------------------------------------------
// SQLite persistence
// ---------------------------------------------------------------------------
mod storage {
    use super::*;
    use rusqlite::{params, Connection, Result as SqliteResult};

    const DB_FILE_NAME: &str = "flight_focus.sqlite";

    pub fn db_path() -> std::path::PathBuf {
        // Local to the app's data directory; no network access.
        let base = dirs::data_local_dir()
            .expect("cannot determine local data directory")
            .join("flight-focus");
        std::fs::create_dir_all(&base).expect("cannot create app data directory");
        base.join(DB_FILE_NAME)
    }

    pub fn connect() -> SqliteResult<Connection> {
        let conn = Connection::open(db_path())?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                phase TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL,
                completed INTEGER NOT NULL,
                audio_mode TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS stats (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            "#,
        )?;
        Ok(conn)
    }

    pub fn insert_session(conn: &Connection, rec: &SessionRecord) -> SqliteResult<()> {
        conn.execute(
            r#"INSERT OR REPLACE INTO sessions
               (id, started_at, ended_at, phase, duration_seconds, completed, audio_mode)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#,
            params![
                rec.id,
                rec.started_at,
                rec.ended_at,
                rec.phase.as_str(),
                rec.duration_seconds,
                rec.completed as i32,
                serde_json::to_string(&rec.audio_mode).unwrap_or_default(),
            ],
        )?;
        Ok(())
    }

    pub fn load_stats(conn: &Connection) -> SqliteResult<FocusStats> {
        let total_sessions: i64 = conn
            .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
            .unwrap_or(0);
        let total_seconds: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(duration_seconds), 0) FROM sessions WHERE completed = 1",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let (current_streak, longest_streak) = compute_streaks(conn)?;
        Ok(FocusStats {
            total_sessions,
            total_minutes: total_seconds / 60,
            current_streak,
            longest_streak,
        })
    }

    pub fn save_journey(conn: &Connection, journey: &JourneyState) -> SqliteResult<()> {
        let json = serde_json::to_string(journey).unwrap_or_default();
        conn.execute(
            "INSERT OR REPLACE INTO stats (key, value) VALUES ('journey', ?1)",
            params![json],
        )?;
        Ok(())
    }

    pub fn load_journey(conn: &Connection) -> SqliteResult<Option<JourneyState>> {
        let json: String = conn
            .query_row("SELECT value FROM stats WHERE key = 'journey'", [], |row| row.get(0))
            .unwrap_or_default();
        if json.is_empty() {
            return Ok(None);
        }
        Ok(serde_json::from_str(&json).ok())
    }

    pub fn load_json_stat<T: for<'de> Deserialize<'de>>(
        conn: &Connection,
        key: &str,
    ) -> SqliteResult<Option<T>> {
        let json: String = conn
            .query_row("SELECT value FROM stats WHERE key = ?1", params![key], |row| row.get(0))
            .unwrap_or_default();
        if json.is_empty() {
            return Ok(None);
        }
        Ok(serde_json::from_str(&json).ok())
    }

    pub fn save_json_stat<T: Serialize + ?Sized>(conn: &Connection, key: &str, value: &T) -> SqliteResult<()> {
        let json = serde_json::to_string(value).unwrap_or_default();
        conn.execute(
            "INSERT OR REPLACE INTO stats (key, value) VALUES (?1, ?2)",
            params![key, json],
        )?;
        Ok(())
    }

    pub fn load_unlocked_achievements(conn: &Connection) -> SqliteResult<Vec<UnlockedAchievement>> {
        Ok(load_json_stat(conn, "achievements_unlocked")?.unwrap_or_default())
    }

    pub fn save_unlocked_achievements(
        conn: &Connection,
        achievements: &[UnlockedAchievement],
    ) -> SqliteResult<()> {
        save_json_stat(conn, "achievements_unlocked", achievements)
    }

    pub fn load_destination_history(conn: &Connection) -> SqliteResult<Vec<String>> {
        Ok(load_json_stat(conn, "destination_history")?.unwrap_or_default())
    }

    pub fn record_destination(conn: &Connection, destination_code: &str) -> SqliteResult<()> {
        let mut history = load_destination_history(conn)?;
        if !history.iter().any(|code| code == destination_code) {
            history.push(destination_code.to_string());
            save_json_stat(conn, "destination_history", &history)?;
        }
        Ok(())
    }

    pub fn load_all_sessions(conn: &Connection) -> SqliteResult<Vec<SessionRecord>> {
        let mut stmt = conn.prepare(
            "SELECT id, started_at, ended_at, phase, duration_seconds, completed, audio_mode
             FROM sessions ORDER BY started_at ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            let phase_str: String = row.get(3)?;
            let phase = match phase_str.as_str() {
                "idle" => Phase::Idle,
                "takeoff" => Phase::Takeoff,
                "cruise" => Phase::Cruise,
                "touchdown" => Phase::Touchdown,
                "rest" => Phase::Rest,
                _ => Phase::Idle,
            };
            let audio_json: String = row.get(6)?;
            Ok(SessionRecord {
                id: row.get(0)?,
                started_at: row.get(1)?,
                ended_at: row.get(2)?,
                phase,
                duration_seconds: row.get(4)?,
                completed: row.get::<_, i32>(5)? != 0,
                audio_mode: serde_json::from_str(&audio_json).unwrap_or(AudioMode::None),
            })
        })?;
        rows.collect()
    }

    pub fn export_bundle(conn: &Connection) -> SqliteResult<FocusExportBundle> {
        Ok(FocusExportBundle {
            version: 1,
            exported_at: chrono::Utc::now().to_rfc3339(),
            sessions: load_all_sessions(conn)?,
            journey: load_journey(conn)?,
            achievements: load_unlocked_achievements(conn)?,
            destination_history: load_destination_history(conn)?,
        })
    }

    pub fn import_bundle(
        conn: &Connection,
        bundle: &FocusExportBundle,
        merge: bool,
    ) -> SqliteResult<ImportResult> {
        if bundle.version != 1 {
            return Ok(ImportResult {
                sessions_added: 0,
                achievements_added: 0,
                journey_updated: false,
            });
        }

        let mut sessions_added = 0usize;
        if merge {
            for session in &bundle.sessions {
                let exists: bool = conn
                    .query_row(
                        "SELECT COUNT(*) FROM sessions WHERE id = ?1",
                        params![session.id],
                        |row| row.get::<_, i64>(0),
                    )
                    .unwrap_or(0)
                    > 0;
                if !exists {
                    insert_session(conn, session)?;
                    sessions_added += 1;
                }
            }
        } else {
            conn.execute("DELETE FROM sessions", [])?;
            for session in &bundle.sessions {
                insert_session(conn, session)?;
                sessions_added += 1;
            }
        }

        let mut achievements_added = 0usize;
        let mut current = load_unlocked_achievements(conn)?;
        for achievement in &bundle.achievements {
            if !current.iter().any(|item| item.id == achievement.id) {
                current.push(achievement.clone());
                achievements_added += 1;
            }
        }
        save_unlocked_achievements(conn, &current)?;

        let mut journey_updated = false;
        if let Some(journey) = &bundle.journey {
            save_journey(conn, journey)?;
            record_destination(conn, &journey.destination_code)?;
            journey_updated = true;
        }

        if !bundle.destination_history.is_empty() {
            let mut history = load_destination_history(conn)?;
            for code in &bundle.destination_history {
                if !history.iter().any(|item| item == code) {
                    history.push(code.clone());
                }
            }
            save_json_stat(conn, "destination_history", &history)?;
        }

        Ok(ImportResult {
            sessions_added,
            achievements_added,
            journey_updated,
        })
    }

    fn achievement_definitions() -> Vec<(AchievementId, &'static str, &'static str, &'static str)> {
        vec![
            (AchievementId::FirstFlight, "First Flight", "Complete your first focus session", "🛫"),
            (AchievementId::TenFlights, "Frequent Flyer", "Complete 10 focus sessions", "✈️"),
            (AchievementId::HourFlown, "Hour in Cruise", "Log 60 minutes of completed focus time", "⏱️"),
            (AchievementId::WeekStreak, "Week Streak", "Maintain a 7-day focus streak", "🔥"),
            (AchievementId::RoutePlanner, "Route Planner", "Set a departure and destination airport", "🗺️"),
            (AchievementId::GlobeTrotter, "Globe Trotter", "Visit 5 unique destination airports", "🌍"),
            (AchievementId::LongHaul, "Long Haul", "Complete a session of 45 minutes or more", "🌙"),
        ]
    }

    pub fn achievement_statuses(conn: &Connection) -> SqliteResult<Vec<AchievementStatus>> {
        let unlocked = load_unlocked_achievements(conn)?;
        Ok(achievement_definitions()
            .into_iter()
            .map(|(id, title, description, icon)| {
                let match_unlocked = unlocked.iter().find(|item| item.id == id);
                AchievementStatus {
                    id,
                    title: title.to_string(),
                    description: description.to_string(),
                    icon: icon.to_string(),
                    unlocked: match_unlocked.is_some(),
                    unlocked_at: match_unlocked.map(|item| item.unlocked_at.clone()),
                }
            })
            .collect())
    }

    pub fn evaluate_achievements(conn: &Connection) -> SqliteResult<Vec<AchievementId>> {
        let stats = load_stats(conn)?;
        let journey = load_journey(conn)?;
        let destination_history = load_destination_history(conn)?;
        let mut unlocked = load_unlocked_achievements(conn)?;
        let mut newly_unlocked = Vec::new();
        let now = chrono::Utc::now().to_rfc3339();

        let completed_sessions: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sessions WHERE completed = 1",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let has_long_haul: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sessions WHERE completed = 1 AND duration_seconds >= 2700",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;

        let candidates = [
            (
                AchievementId::FirstFlight,
                completed_sessions >= 1,
            ),
            (
                AchievementId::TenFlights,
                completed_sessions >= 10,
            ),
            (
                AchievementId::HourFlown,
                stats.total_minutes >= 60,
            ),
            (
                AchievementId::WeekStreak,
                stats.current_streak >= 7,
            ),
            (
                AchievementId::RoutePlanner,
                journey.is_some(),
            ),
            (
                AchievementId::GlobeTrotter,
                destination_history.len() >= 5,
            ),
            (
                AchievementId::LongHaul,
                has_long_haul,
            ),
        ];

        for (id, earned) in candidates {
            if !earned {
                continue;
            }
            if unlocked.iter().any(|item| item.id == id) {
                continue;
            }
            unlocked.push(UnlockedAchievement {
                id,
                unlocked_at: now.clone(),
            });
            newly_unlocked.push(id);
        }

        if !newly_unlocked.is_empty() {
            save_unlocked_achievements(conn, &unlocked)?;
        }

        Ok(newly_unlocked)
    }

    fn compute_streaks(conn: &Connection) -> SqliteResult<(i32, i32)> {
        let today = chrono::Local::now().date_naive();

        let mut stmt = conn.prepare(
            "SELECT DISTINCT DATE(started_at) as day FROM sessions WHERE completed = 1 ORDER BY day DESC",
        )?;
        let days = stmt.query_map([], |row| row.get::<_, String>("day"))?
            .collect::<SqliteResult<Vec<String>>>()?;

        let parsed_days = days
            .iter()
            .filter_map(|day| chrono::NaiveDate::parse_from_str(day, "%Y-%m-%d").ok())
            .collect::<Vec<_>>();

        let mut current_streak = 0i32;
        for offset in 0.. {
            let expected = today - chrono::Duration::days(offset);
            if parsed_days.contains(&expected) {
                current_streak += 1;
            } else {
                break;
            }
        }

        let mut longest_streak = 0i32;
        let mut run_length = 0i32;
        let mut previous_day: Option<chrono::NaiveDate> = None;
        for day in parsed_days {
            if previous_day
                .map(|previous| previous - chrono::Duration::days(1) == day)
                .unwrap_or(true)
            {
                run_length += 1;
            } else {
                run_length = 1;
            }
            longest_streak = longest_streak.max(run_length);
            previous_day = Some(day);
        }

        Ok((current_streak, longest_streak))
    }
}

fn save_session_record(record: &SessionRecord) -> Result<(), FlightFocusError> {
    #[cfg(test)]
    {
        let _ = record;
        Ok(())
    }

    #[cfg(not(test))]
    {
        let conn = storage::connect().map_err(|e| {
            FlightFocusError::Storage(format!("failed to open database: {}", e))
        })?;
        storage::insert_session(&conn, record)
            .map_err(|e| FlightFocusError::Storage(e.to_string()))?;
        storage::evaluate_achievements(&conn)
            .map_err(|e| FlightFocusError::Storage(e.to_string()))?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Focus session state machine (deterministic)
// ---------------------------------------------------------------------------
#[derive(Debug, Clone)]
pub struct FocusSessionEngine {
    pub session: Option<FocusSession>,
    pub elapsed_at_pause: i64,
    pub phase_transition_time: Instant,
}

impl FocusSessionEngine {
    pub fn new() -> Self {
        Self {
            session: None,
            elapsed_at_pause: 0,
            phase_transition_time: Instant::now(),
        }
    }

    fn transition_phase(
        &mut self,
        current: Phase,
        next: Phase,
        now: &chrono::DateTime<chrono::Utc>,
    ) -> Result<(), FlightFocusError> {
        match (current, next) {
            (Phase::Idle, Phase::Takeoff) => {}
            (Phase::Takeoff, Phase::Cruise) => {}
            (Phase::Cruise, Phase::Touchdown) => {}
            // Session can run out of time while still in takeoff (short
            // sessions or a single large tick); landing directly is valid.
            (Phase::Takeoff, Phase::Touchdown) => {}
            (Phase::Cruise, Phase::Takeoff) => {} // resume after pause
            (Phase::Touchdown, Phase::Rest) => {}
            (Phase::Rest, Phase::Idle) => {}
            (Phase::Idle, Phase::Idle)
            | (Phase::Takeoff, Phase::Takeoff)
            | (Phase::Cruise, Phase::Cruise)
            | (Phase::Touchdown, Phase::Touchdown)
            | (Phase::Rest, Phase::Rest) => {}
            _ => {
                return Err(FlightFocusError::InvalidTransition(format!(
                    "{} -> {}",
                    current.as_str(),
                    next.as_str()
                )));
            }
        }

        if let Some(ref mut session) = self.session {
            session.phase = next;
            session.last_heartbeat = now.to_rfc3339();
        }
        self.phase_transition_time = Instant::now();
        Ok(())
    }

    pub fn create_session(
        &mut self,
        req: CreateSessionRequest,
    ) -> Result<FocusSession, FlightFocusError> {
        if self.session.is_some() {
            return Err(FlightFocusError::InvalidTransition(
                "active session already exists".into(),
            ));
        }
        if req.duration_seconds <= 0 {
            return Err(FlightFocusError::InvalidTransition(
                "duration must be greater than zero".into(),
            ));
        }

        let now = chrono::Utc::now();
        let session = FocusSession {
            id: uuid::Uuid::new_v4().to_string(),
            phase: Phase::Takeoff,
            started_at: now.to_rfc3339(),
            total_duration_seconds: req.duration_seconds,
            remaining_seconds: req.duration_seconds,
            completed: false,
            audio: req.audio_mode.unwrap_or(AudioMode::None),
            last_heartbeat: now.to_rfc3339(),
        };

        self.session = Some(session.clone());
        self.elapsed_at_pause = 0;
        self.phase_transition_time = Instant::now();

        Ok(session)
    }

    pub fn tick(&mut self, dt_seconds: i64) -> Result<FocusSession, FlightFocusError> {
        let now = chrono::Utc::now();
        let dt_seconds = dt_seconds.max(0);

        let (current_phase, new_phase) = {
            let session = self
                .session
                .as_mut()
                .ok_or(FlightFocusError::NoSessionInProgress)?;

            if matches!(session.phase, Phase::Idle | Phase::Rest | Phase::Touchdown) {
                return Ok(session.clone());
            }

            if session.remaining_seconds > 0 && dt_seconds > 0 {
                session.remaining_seconds = (session.remaining_seconds - dt_seconds).max(0);
            }

            let total = session.total_duration_seconds;
            let remaining = session.remaining_seconds;
            let new_phase = if remaining <= 0 {
                Phase::Touchdown
            } else if total - remaining < 30 {
                Phase::Takeoff
            } else {
                Phase::Cruise
            };

            (session.phase, new_phase)
        };

        if new_phase != current_phase {
            self.transition_phase(current_phase, new_phase, &now)?;
        }

        let (session, completed_record) = {
            let session = self
                .session
                .as_mut()
                .ok_or(FlightFocusError::NoSessionInProgress)?;
            session.last_heartbeat = now.to_rfc3339();

            let completed_record = if session.remaining_seconds <= 0 && !session.completed {
                session.remaining_seconds = 0;
                session.completed = true;
                Some(SessionRecord {
                    id: session.id.clone(),
                    started_at: session.started_at.clone(),
                    ended_at: Some(now.to_rfc3339()),
                    phase: Phase::Touchdown,
                    duration_seconds: session.total_duration_seconds,
                    completed: true,
                    audio_mode: session.audio.clone(),
                })
            } else {
                None
            };

            (session.clone(), completed_record)
        };

        if let Some(record) = completed_record {
            save_session_record(&record)?;
        }

        Ok(session)
    }

    pub fn complete(&mut self) -> Result<SessionSummary, FlightFocusError> {
        let session = self.session.take().ok_or(FlightFocusError::NoSessionInProgress)?;
        let now = chrono::Utc::now();
        let record = SessionRecord {
            id: session.id.clone(),
            started_at: session.started_at.clone(),
            ended_at: Some(now.to_rfc3339()),
            phase: Phase::Touchdown,
            duration_seconds: session.total_duration_seconds,
            completed: true,
            audio_mode: session.audio.clone(),
        };
        save_session_record(&record)?;

        let summary = SessionSummary {
            session_id: session.id.clone(),
            completed: true,
            duration_seconds: session.total_duration_seconds,
            phase: Phase::Touchdown,
            ended_at: now.to_rfc3339(),
        };
        self.elapsed_at_pause = 0;
        Ok(summary)
    }

    pub fn pause(&mut self) -> Result<FocusSession, FlightFocusError> {
        let session = self.session.as_mut().ok_or(FlightFocusError::NoSessionInProgress)?;
        let now = chrono::Utc::now();
        self.elapsed_at_pause = session.total_duration_seconds - session.remaining_seconds;
        session.last_heartbeat = now.to_rfc3339();
        Ok(session.clone())
    }

    pub fn resume(&mut self) -> Result<FocusSession, FlightFocusError> {
        let session = self.session.as_mut().ok_or(FlightFocusError::NoSessionInProgress)?;
        let now = chrono::Utc::now();
        session.last_heartbeat = now.to_rfc3339();
        Ok(session.clone())
    }

    pub fn skip(&mut self) -> Result<Option<SessionSummary>, FlightFocusError> {
        let session = self.session.take().ok_or(FlightFocusError::NoSessionInProgress)?;
        let now = chrono::Utc::now();
        let elapsed_seconds = session.total_duration_seconds - session.remaining_seconds;
        let record = SessionRecord {
            id: session.id.clone(),
            started_at: session.started_at.clone(),
            ended_at: Some(now.to_rfc3339()),
            phase: Phase::Touchdown,
            duration_seconds: elapsed_seconds,
            completed: false,
            audio_mode: session.audio.clone(),
        };
        save_session_record(&record)?;

        let summary = SessionSummary {
            session_id: session.id.clone(),
            completed: false,
            duration_seconds: elapsed_seconds,
            phase: Phase::Touchdown,
            ended_at: now.to_rfc3339(),
        };
        self.elapsed_at_pause = 0;
        Ok(Some(summary))
    }

    pub fn reset(&mut self) -> Result<(), FlightFocusError> {
        self.session = None;
        self.elapsed_at_pause = 0;
        Ok(())
    }

    pub fn current(&self) -> Result<Option<FocusSession>, FlightFocusError> {
        Ok(self.session.clone())
    }

    pub fn stats(&self) -> Result<FocusStats, FlightFocusError> {
        let conn = storage::connect().map_err(|e| FlightFocusError::Storage(e.to_string()))?;
        storage::load_stats(&conn).map_err(|e| FlightFocusError::Storage(e.to_string()))
    }
}

impl Default for FocusSessionEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(duration_seconds: i64) -> CreateSessionRequest {
        CreateSessionRequest {
            duration_seconds,
            audio_mode: Some(AudioMode::None),
        }
    }

    #[test]
    fn create_session_starts_takeoff_and_counts_down() {
        let mut engine = FocusSessionEngine::new();
        let session = engine.create_session(request(1500)).expect("create session");

        assert_eq!(session.phase, Phase::Takeoff);
        assert_eq!(session.total_duration_seconds, 1500);
        assert_eq!(session.remaining_seconds, 1500);
        assert!(!session.completed);
    }

    #[test]
    fn create_session_rejects_non_positive_duration() {
        let mut engine = FocusSessionEngine::new();

        let result = engine.create_session(request(0));

        assert!(matches!(result, Err(FlightFocusError::InvalidTransition(_))));
    }

    #[test]
    fn tick_uses_whole_seconds_and_moves_to_cruise() {
        let mut engine = FocusSessionEngine::new();
        engine.create_session(request(120)).expect("create session");

        let session = engine.tick(31).expect("tick");

        assert_eq!(session.phase, Phase::Cruise);
        assert_eq!(session.remaining_seconds, 89);
        assert!(!session.completed);
    }

    #[test]
    fn tick_completes_without_negative_remaining_time() {
        let mut engine = FocusSessionEngine::new();
        engine.create_session(request(10)).expect("create session");

        let session = engine.tick(20).expect("tick");

        assert_eq!(session.phase, Phase::Touchdown);
        assert_eq!(session.remaining_seconds, 0);
        assert!(session.completed);
    }

    #[test]
    fn pause_and_resume_keep_same_phase_and_session() {
        let mut engine = FocusSessionEngine::new();
        let created = engine.create_session(request(300)).expect("create session");

        let paused = engine.pause().expect("pause");
        let resumed = engine.resume().expect("resume");

        assert_eq!(created.id, paused.id);
        assert_eq!(paused.id, resumed.id);
        assert_eq!(created.phase, paused.phase);
        assert_eq!(paused.phase, resumed.phase);
    }

    #[test]
    fn skip_returns_elapsed_summary_and_clears_session() {
        let mut engine = FocusSessionEngine::new();
        engine.create_session(request(300)).expect("create session");
        engine.tick(45).expect("tick");

        let summary = engine.skip().expect("skip").expect("summary");

        assert!(!summary.completed);
        assert_eq!(summary.duration_seconds, 45);
        assert!(engine.current().expect("current").is_none());
    }

    #[test]
    fn complete_returns_summary_and_clears_session() {
        let mut engine = FocusSessionEngine::new();
        engine.create_session(request(60)).expect("create session");

        let summary = engine.complete().expect("complete");

        assert!(summary.completed);
        assert_eq!(summary.phase, Phase::Touchdown);
        assert!(engine.current().expect("current").is_none());
    }

    #[test]
    fn audio_mode_accepts_typescript_shape() {
        let json = r#"{"type":"binaural_beats","frequencyHz":200,"brainwave":"focus"}"#;

        let mode = serde_json::from_str::<AudioMode>(json).expect("deserialize audio mode");

        assert!(matches!(
            mode,
            AudioMode::BinauralBeats {
                frequency_hz: 200,
                brainwave
            } if brainwave == "focus"
        ));
    }

    #[test]
    fn journey_state_accepts_legacy_snake_case_storage() {
        let json = r#"{"departure_code":"DXB","destination_code":"LHR"}"#;

        let journey = serde_json::from_str::<JourneyState>(json).expect("deserialize journey");

        assert_eq!(journey.departure_code, "DXB");
        assert_eq!(journey.destination_code, "LHR");
    }

    #[test]
    fn export_bundle_round_trips_camel_case() {
        let bundle = FocusExportBundle {
            version: 1,
            exported_at: "2026-06-21T00:00:00Z".to_string(),
            sessions: vec![],
            journey: Some(JourneyState {
                departure_code: "JFK".to_string(),
                destination_code: "LHR".to_string(),
            }),
            achievements: vec![UnlockedAchievement {
                id: AchievementId::FirstFlight,
                unlocked_at: "2026-06-21T00:00:00Z".to_string(),
            }],
            destination_history: vec!["LHR".to_string()],
        };

        let json = serde_json::to_string(&bundle).expect("serialize");
        assert!(json.contains("destinationHistory"));
        assert!(json.contains("departureCode"));

        let parsed: FocusExportBundle = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed.version, 1);
        assert_eq!(parsed.destination_history.len(), 1);
    }
}

// ---------------------------------------------------------------------------
// Application state and IPC commands
// ---------------------------------------------------------------------------
#[derive(Default)]
pub struct AppState {
    pub engine: Arc<Mutex<FocusSessionEngine>>,
}

// Initialize database on app startup.
pub fn init_storage() -> Result<(), FlightFocusError> {
    let _ = storage::connect().map_err(|e| FlightFocusError::Storage(e.to_string()))?;
    Ok(())
}

#[tauri::command]
fn initialize_focus(_state: State<'_, AppState>) -> Result<(), FlightFocusError> {
    init_storage()
}

#[tauri::command]
fn create_focus_session(
    state: State<'_, AppState>,
    duration_seconds: i64,
    audio_mode_json: Option<String>,
) -> Result<FocusSession, FlightFocusError> {
    let mut engine = state.engine.lock().expect("engine poisoned");
    let audio_mode = match audio_mode_json {
        Some(json) => serde_json::from_str(&json).unwrap_or(AudioMode::None),
        None => AudioMode::None,
    };
    engine.create_session(CreateSessionRequest {
        duration_seconds,
        audio_mode: Some(audio_mode),
    })
}

#[tauri::command]
fn tick_focus_session(
    state: State<'_, AppState>,
    dt_seconds: i64,
) -> Result<FocusSession, FlightFocusError> {
    let mut engine = state.engine.lock().expect("engine poisoned");
    engine.tick(dt_seconds)
}

#[tauri::command]
fn pause_focus_session(
    state: State<'_, AppState>,
) -> Result<FocusSession, FlightFocusError> {
    let mut engine = state.engine.lock().expect("engine poisoned");
    engine.pause()
}

#[tauri::command]
fn resume_focus_session(
    state: State<'_, AppState>,
) -> Result<FocusSession, FlightFocusError> {
    let mut engine = state.engine.lock().expect("engine poisoned");
    engine.resume()
}

#[tauri::command]
fn skip_focus_session(
    state: State<'_, AppState>,
) -> Result<Option<SessionSummary>, FlightFocusError> {
    let mut engine = state.engine.lock().expect("engine poisoned");
    engine.skip()
}

#[tauri::command]
fn reset_focus_session(
    state: State<'_, AppState>,
) -> Result<(), FlightFocusError> {
    let mut engine = state.engine.lock().expect("engine poisoned");
    engine.reset()
}

#[tauri::command]
fn complete_focus_session(
    state: State<'_, AppState>,
) -> Result<SessionSummary, FlightFocusError> {
    let mut engine = state.engine.lock().expect("engine poisoned");
    engine.complete()
}

#[tauri::command]
fn current_focus_session(
    state: State<'_, AppState>,
) -> Result<Option<FocusSession>, FlightFocusError> {
    let engine = state.engine.lock().expect("engine poisoned");
    engine.current()
}

#[tauri::command]
fn focus_stats(
    state: State<'_, AppState>,
) -> Result<FocusStats, FlightFocusError> {
    let engine = state.engine.lock().expect("engine poisoned");
    engine.stats()
}

#[tauri::command]
fn set_journey(
    _state: State<'_, AppState>,
    departure_code: String,
    destination_code: String,
) -> Result<JourneyState, FlightFocusError> {
    let journey = JourneyState {
        departure_code,
        destination_code,
    };
    let conn = storage::connect().map_err(|e| FlightFocusError::Storage(e.to_string()))?;
    storage::save_journey(&conn, &journey)
        .map_err(|e| FlightFocusError::Storage(e.to_string()))?;
    storage::record_destination(&conn, &journey.destination_code)
        .map_err(|e| FlightFocusError::Storage(e.to_string()))?;
    storage::evaluate_achievements(&conn)
        .map_err(|e| FlightFocusError::Storage(e.to_string()))?;
    Ok(journey)
}

#[tauri::command]
fn focus_achievements(
    _state: State<'_, AppState>,
) -> Result<Vec<AchievementStatus>, FlightFocusError> {
    let conn = storage::connect().map_err(|e| FlightFocusError::Storage(e.to_string()))?;
    storage::achievement_statuses(&conn)
        .map_err(|e| FlightFocusError::Storage(e.to_string()))
}

#[tauri::command]
fn export_focus_data(
    _state: State<'_, AppState>,
) -> Result<FocusExportBundle, FlightFocusError> {
    let conn = storage::connect().map_err(|e| FlightFocusError::Storage(e.to_string()))?;
    storage::export_bundle(&conn)
        .map_err(|e| FlightFocusError::Storage(e.to_string()))
}

#[tauri::command]
fn import_focus_data(
    _state: State<'_, AppState>,
    bundle_json: String,
    merge: Option<bool>,
) -> Result<ImportResult, FlightFocusError> {
    let bundle = serde_json::from_str::<FocusExportBundle>(&bundle_json)
        .map_err(|e| FlightFocusError::Serialization(e.to_string()))?;
    let conn = storage::connect().map_err(|e| FlightFocusError::Storage(e.to_string()))?;
    storage::import_bundle(&conn, &bundle, merge.unwrap_or(true))
        .map_err(|e| FlightFocusError::Storage(e.to_string()))
}

#[tauri::command]
fn get_journey(
    _state: State<'_, AppState>,
) -> Result<Option<JourneyState>, FlightFocusError> {
    let conn = storage::connect().map_err(|e| FlightFocusError::Storage(e.to_string()))?;
    storage::load_journey(&conn)
        .map_err(|e| FlightFocusError::Storage(e.to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            initialize_focus,
            create_focus_session,
            tick_focus_session,
            pause_focus_session,
            resume_focus_session,
            skip_focus_session,
            reset_focus_session,
            complete_focus_session,
            current_focus_session,
            focus_stats,
            set_journey,
            get_journey,
            focus_achievements,
            export_focus_data,
            import_focus_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
