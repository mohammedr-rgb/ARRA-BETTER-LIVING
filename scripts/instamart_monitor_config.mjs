// Stable target catalog only. This file intentionally contains no observed prices or stock claims.
export const CITY_GEO_MATRIX = {
  Chennai: { latitude: 13.0827, longitude: 80.2707, radiusKm: 45, area: 'T Nagar', deliveryMin: '8 MINS', state: 'Tamil Nadu' },
  Bangalore: { latitude: 12.9716, longitude: 77.5946, radiusKm: 50, area: 'Koramangala', deliveryMin: '9 MINS', state: 'Karnataka' },
  Coimbatore: { latitude: 11.0168, longitude: 76.9558, radiusKm: 35, area: 'RS Puram', deliveryMin: '9 MINS', state: 'Tamil Nadu' },
  Hyderabad: { latitude: 17.385, longitude: 78.4867, radiusKm: 48, area: 'Gachibowli', deliveryMin: '10 MINS', state: 'Telangana' },
  Mumbai: { latitude: 19.076, longitude: 72.8777, radiusKm: 60, area: 'Andheri East', deliveryMin: '11 MINS', state: 'Maharashtra' },
  Salem: { latitude: 11.6643, longitude: 78.146, radiusKm: 30, area: 'Fairlands', deliveryMin: '6 MINS', state: 'Tamil Nadu' },
  Trichy: { latitude: 10.7905, longitude: 78.7047, radiusKm: 28, area: 'Thillai Nagar', deliveryMin: '7 MINS', state: 'Tamil Nadu' },
  Vizag: { latitude: 17.6868, longitude: 83.2185, radiusKm: 35, area: 'MVP Colony', deliveryMin: '9 MINS', state: 'Andhra Pradesh' },
  Madurai: { latitude: 9.9252, longitude: 78.1198, radiusKm: 32, area: 'KK Nagar', deliveryMin: '7 MINS', state: 'Tamil Nadu' },
  Pune: { latitude: 18.5204, longitude: 73.8567, radiusKm: 40, area: 'Kothrud', deliveryMin: '10 MINS', state: 'Maharashtra' },
  Pondicherry: { latitude: 11.9416, longitude: 79.8083, radiusKm: 25, area: 'White Town', deliveryMin: '8 MINS', state: 'Puducherry' },
  Vijayawada: { latitude: 16.5062, longitude: 80.648, radiusKm: 30, area: 'Benz Circle', deliveryMin: '9 MINS', state: 'Andhra Pradesh' },
  Tirupur: { latitude: 11.1085, longitude: 77.3411, radiusKm: 25, area: 'Kumar Nagar', deliveryMin: '9 MINS', state: 'Tamil Nadu' },
  Kochi: { latitude: 9.9312, longitude: 76.2673, radiusKm: 38, area: 'Kaloor', deliveryMin: '11 MINS', state: 'Kerala' },
  Erode: { latitude: 11.341, longitude: 77.7172, radiusKm: 25, area: 'Perundurai Road', deliveryMin: '6 MINS', state: 'Tamil Nadu' },
  Vellore: { latitude: 12.9165, longitude: 79.1325, radiusKm: 25, area: 'Gandhi Nagar', deliveryMin: '8 MINS', state: 'Tamil Nadu' },
  Thanjavur: { latitude: 10.787, longitude: 79.1378, radiusKm: 20, area: 'Medical College Rd', deliveryMin: '8 MINS', state: 'Tamil Nadu' },
  Tirunelveli: { latitude: 8.7139, longitude: 77.7567, radiusKm: 25, area: 'Palayamkottai', deliveryMin: '8 MINS', state: 'Tamil Nadu' },
  Mysore: { latitude: 12.2958, longitude: 76.6394, radiusKm: 30, area: 'Gokulam', deliveryMin: '9 MINS', state: 'Karnataka' },
  Nellore: { latitude: 14.4426, longitude: 79.9865, radiusKm: 25, area: 'Magunta Layout', deliveryMin: '9 MINS', state: 'Andhra Pradesh' },
  Thoothukudi: { latitude: 8.7642, longitude: 78.1348, radiusKm: 22, area: 'Millerpuram', deliveryMin: '8 MINS', state: 'Tamil Nadu' },
  Kanchipuram: { latitude: 12.8387, longitude: 79.7016, radiusKm: 20, area: 'Gandhi Road', deliveryMin: '7 MINS', state: 'Tamil Nadu' },
  Warangal: { latitude: 17.9784, longitude: 79.5941, radiusKm: 28, area: 'Hanamkonda', deliveryMin: '10 MINS', state: 'Telangana' },
  Karur: { latitude: 10.9601, longitude: 78.0766, radiusKm: 20, area: 'Kovai Road', deliveryMin: '6 MINS', state: 'Tamil Nadu' },
  'Central Goa': { latitude: 15.4909, longitude: 73.8278, radiusKm: 35, area: 'Panaji', deliveryMin: '11 MINS', state: 'Goa' }
};

export const TARGET_CITIES = Object.entries(CITY_GEO_MATRIX).map(([name, data]) => ({
  id: name.toUpperCase().replace(/\s+/g, '_'),
  name,
  area: data.area,
  lat: data.latitude,
  lng: data.longitude,
  radiusKm: data.radiusKm,
  deliveryMin: data.deliveryMin,
  state: data.state
}));

export const TARGET_SKUS = [
  { id: 'pouch_1l', standardName: "GEM'S GOLD Cold Pressed Groundnut oil Pouch 1.0 ltr", shortName: 'Pouch 1L', packType: 'Pouch', volumeMl: 1000 },
  { id: 'bottle_1l', standardName: "GEM'S GOLD Cold Pressed Groundnut oil Bottle 1.0 ltr", shortName: 'Bottle 1L', packType: 'Bottle', volumeMl: 1000 },
  { id: 'bottle_2l', standardName: "GEM'S GOLD Cold Pressed Groundnut oil Bottle 2.0 ltr", shortName: 'Bottle 2L', packType: 'Bottle', volumeMl: 2000 },
  { id: 'bottle_500ml', standardName: "GEM'S GOLD Cold Pressed Groundnut oil 500.0 ml", shortName: 'Bottle 500ml', packType: 'Bottle', volumeMl: 500 },
  { id: 'spray_200ml', standardName: "Gem's Gold Groundnut Oil Reusable Spray 200.0 ml", shortName: 'Spray 200ml', packType: 'Spray', volumeMl: 200 }
];
