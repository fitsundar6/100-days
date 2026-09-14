import prisma from '../lib/prisma';
import { queryWithTimeout } from '../lib/db-safe';

// Default Alpha X Gym coordinates (can be overridden per facility in DB or .env)
const DEFAULT_GYM_LAT = parseFloat(process.env.GYM_DEFAULT_LAT || '12.9716');
const DEFAULT_GYM_LNG = parseFloat(process.env.GYM_DEFAULT_LNG || '77.5946');
const DEFAULT_ALLOWED_RADIUS = parseFloat(process.env.GYM_ALLOWED_RADIUS || '75.0'); // 75 meters

// Maximum acceptable accuracy radius in meters before GPS is considered too imprecise (e.g. IP/cellular tower)
const MAX_ALLOWED_ACCURACY_METERS = 65.0;

export interface GeofenceVerificationResult {
  isWithinGeofence: boolean;
  distanceMeters: number;
  allowedRadiusMeters: number;
  accuracyMeters: number;
  gymName: string;
  error?: string;
}

/**
 * Calculate the great-circle distance between two GPS coordinates using the Haversine Formula.
 * Returns distance in meters.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const EARTH_RADIUS_METERS = 6371000; // Mean radius of the Earth in meters

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = EARTH_RADIUS_METERS * c;
  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

/**
 * Validates whether GPS coordinates are mathematically within legitimate bounds
 */
export function isValidGpsCoordinate(lat: any, lng: any): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

/**
 * Server-side Geofence & Location Accuracy Verification
 * Strictly calculates distance on the backend without trusting client assertions.
 */
export async function verifyClientGeofence(
  clientLat: number,
  clientLng: number,
  clientAccuracy: number,
  gymId?: string
): Promise<GeofenceVerificationResult> {
  // 1. Validate coordinates presence and bounds
  if (!isValidGpsCoordinate(clientLat, clientLng)) {
    return {
      isWithinGeofence: false,
      distanceMeters: -1,
      allowedRadiusMeters: DEFAULT_ALLOWED_RADIUS,
      accuracyMeters: clientAccuracy || 0,
      gymName: 'Alpha X Gym',
      error: 'Invalid GPS coordinates received from device.',
    };
  }

  // 2. Resolve Gym coordinates & allowed radius from database
  let gymLat = DEFAULT_GYM_LAT;
  let gymLng = DEFAULT_GYM_LNG;
  let allowedRadius = DEFAULT_ALLOWED_RADIUS;
  let gymName = 'Alpha X Gym — Main Facility';

  try {
    let gymRecord = null;
    if (gymId) {
      gymRecord = await queryWithTimeout(prisma.gym.findUnique({ where: { id: gymId } }), 600);
    }
    if (!gymRecord) {
      gymRecord = await queryWithTimeout(prisma.gym.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      }), 600);
    }

    if (gymRecord) {
      gymLat = gymRecord.latitude;
      gymLng = gymRecord.longitude;
      allowedRadius = gymRecord.allowedRadiusMeters;
      gymName = gymRecord.name;
    }
  } catch (dbErr) {
    console.warn('Database offline while fetching gym coordinates, using fallback defaults');
  }

  const accuracy = typeof clientAccuracy === 'number' && !isNaN(clientAccuracy) ? clientAccuracy : 999;

  // 3. CHECK 6 (Accuracy Threshold): Reject poor accuracy GPS
  if (accuracy > MAX_ALLOWED_ACCURACY_METERS) {
    return {
      isWithinGeofence: false,
      distanceMeters: -1,
      allowedRadiusMeters: allowedRadius,
      accuracyMeters: accuracy,
      gymName,
      error: 'Your location could not be verified accurately. Please move closer to the gym entrance and try again.',
    };
  }

  // 4. Calculate Haversine distance from gym center to client
  const distanceMeters = calculateHaversineDistance(gymLat, gymLng, clientLat, clientLng);

  // 5. Check if inside allowed radius (with modest indoor jitter buffer capped at 15m)
  const indoorJitterAllowance = Math.min(accuracy * 0.25, 15);
  const effectiveRadius = allowedRadius + indoorJitterAllowance;

  if (distanceMeters > effectiveRadius) {
    return {
      isWithinGeofence: false,
      distanceMeters,
      allowedRadiusMeters: allowedRadius,
      accuracyMeters: accuracy,
      gymName,
      error: 'You appear to be outside the gym check-in area. Please check in from Alpha X Gym.',
    };
  }

  // 6. Geofence Check Passed
  return {
    isWithinGeofence: true,
    distanceMeters,
    allowedRadiusMeters: allowedRadius,
    accuracyMeters: accuracy,
    gymName,
  };
}
