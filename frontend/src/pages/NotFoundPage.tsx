import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4">
      <p className="text-6xl font-bold text-gray-800">404</p>
      <p className="text-gray-400">This page doesn't exist.</p>
      <Link to="/" className="text-indigo-400 hover:text-indigo-300 text-sm">
        ← Back to home
      </Link>
    </div>
  );
}
