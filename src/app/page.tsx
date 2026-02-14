import MeditationTimer from '@/components/MeditationTimer';
import GoalList from '@/components/GoalList';
import Settings from '@/components/Settings';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top Bar */}
      <header className="flex items-start justify-between px-6 py-6 md:px-10 md:py-8">
        {/* Top Left: Meditation Timer */}
        <div className="flex-shrink-0">
          <MeditationTimer />
        </div>

        {/* Top Right: Settings */}
        <div className="flex-shrink-0">
          <Settings />
        </div>
      </header>

      {/* Main Content: Goal List */}
      <main className="px-6 pb-16 md:px-10">
        <div className="mx-auto max-w-2xl">
          <GoalList />
        </div>
      </main>
    </div>
  );
}
