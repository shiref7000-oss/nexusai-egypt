import { useLocation } from 'react-router-dom';

export default function PlaceholderPage({ title }: { title?: string }) {
  const { pathname } = useLocation();
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold">{title || pathname}</h1>
      <p className="text-gray-500 text-sm mt-2">This section is available in the full NexusAI build.</p>
    </div>
  );
}
