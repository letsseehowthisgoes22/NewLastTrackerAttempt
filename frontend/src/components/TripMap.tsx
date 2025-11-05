import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

const pickupIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const dropoffIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface TripMapProps {
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  pickupLocation: string;
  dropoffLocation: string;
}

function FitBounds({ pickupLat, pickupLng, dropoffLat, dropoffLng }: { 
  pickupLat: number; 
  pickupLng: number; 
  dropoffLat: number; 
  dropoffLng: number; 
}) {
  const map = useMap();
  
  useEffect(() => {
    const bounds = L.latLngBounds(
      [pickupLat, pickupLng],
      [dropoffLat, dropoffLng]
    );
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [map, pickupLat, pickupLng, dropoffLat, dropoffLng]);
  
  return null;
}

export const TripMap: React.FC<TripMapProps> = ({
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  pickupLocation,
  dropoffLocation,
}) => {
  const centerLat = (pickupLat + dropoffLat) / 2;
  const centerLng = (pickupLng + dropoffLng) / 2;

  return (
    <div className="w-full h-[400px] rounded-lg overflow-hidden border shadow-md">
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={10}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Pickup Marker (Green) */}
        <Marker position={[pickupLat, pickupLng]} icon={pickupIcon}>
          <Popup>
            <div className="text-sm">
              <strong>Pickup Location</strong>
              <br />
              {pickupLocation}
            </div>
          </Popup>
        </Marker>
        
        {/* Dropoff Marker (Red) */}
        <Marker position={[dropoffLat, dropoffLng]} icon={dropoffIcon}>
          <Popup>
            <div className="text-sm">
              <strong>Dropoff Location</strong>
              <br />
              {dropoffLocation}
            </div>
          </Popup>
        </Marker>
        
        {/* Auto-fit bounds to show both markers */}
        <FitBounds 
          pickupLat={pickupLat} 
          pickupLng={pickupLng} 
          dropoffLat={dropoffLat} 
          dropoffLng={dropoffLng} 
        />
      </MapContainer>
    </div>
  );
};
