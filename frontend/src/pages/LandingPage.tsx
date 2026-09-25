import { Link } from 'react-router-dom';

/**
 * Landing page — the public-facing entry point.
 *
 * This is a placeholder. It will be expanded into a full marketing
 * page once auth and the dashboard are working.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-indigo-400">CloudForge</span>
          <span className="text-xl font-bold text-white">AI</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            to="/login"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="text-sm bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-md transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-6">
        <div className="inline-flex items-center gap-2 bg-indigo-950 border border-indigo-800 text-indigo-300 text-xs px-3 py-1 rounded-full">
          AI-native cloud development
        </div>

        <h1 className="text-5xl md:text-6xl font-bold max-w-3xl leading-tight">
          From idea to deployed app,{' '}
          <span className="text-indigo-400">without leaving your browser.</span>
        </h1>

        <p className="text-lg text-gray-400 max-w-xl">
          CloudForge AI combines a browser-based IDE, AI coding agent, and cloud deployment
          into a single platform. Write code, fix bugs, and ship — all in one place.
        </p>

        <div className="flex items-center gap-4 mt-2">
          <Link
            to="/register"
            className="bg-indigo-600 hover:bg-indigo-500 px-6 py-3 rounded-md font-medium transition-colors"
          >
            Start building for free
          </Link>
          <Link
            to="/login"
            className="text-gray-400 hover:text-white px-6 py-3 rounded-md border border-gray-700 hover:border-gray-500 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-gray-800 text-center text-sm text-gray-600">
        CloudForge AI — Phase 1
      </footer>
    </div>
  );
}
