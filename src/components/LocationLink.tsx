import { MapPin } from 'lucide-react';
import type { Property } from '../lib/model';

export function LocationLink({ location }: { location: NonNullable<Property['location']> }) {
  const params = new URLSearchParams({
    coordinate: `${location.latitude},${location.longitude}`,
    name: 'Saved location',
  });
  return (
    <a
      className="button soft location-link"
      href={`https://maps.apple.com/place?${params}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <MapPin size={18} aria-hidden="true" />
      Open in Maps
    </a>
  );
}
