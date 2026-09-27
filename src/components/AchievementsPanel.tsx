import type { AchievementStatus } from "../focus/api";

export default function AchievementsPanel({
  achievements,
}: {
  achievements: AchievementStatus[];
}) {
  const unlockedCount = achievements.filter((item) => item.unlocked).length;

  return (
    <section className="achievementsPanel" aria-label="Achievements">
      <div className="achievementsHeader">
        <h2>Achievements</h2>
        <span className="achievementsCount">
          {unlockedCount}/{achievements.length}
        </span>
      </div>
      <ul className="achievementsGrid">
        {achievements.map((achievement) => (
          <li
            key={achievement.id}
            className={`achievementCard${achievement.unlocked ? " unlocked" : ""}`}
            title={achievement.description}
          >
            <span className="achievementIcon" aria-hidden="true">
              {achievement.icon}
            </span>
            <div className="achievementCopy">
              <span className="achievementTitle">{achievement.title}</span>
              <span className="achievementDescription">{achievement.description}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
