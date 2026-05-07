import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { EV } from '@/constants/theme';
import { STATIONS as TRAIN_STATIONS, LINE_COLORS } from '@/data/trainStations';
import { JEEP_SHAPES, RAIL_SHAPES } from '@/data/transitShapes';

interface MapComponentProps {
  mapRef: React.RefObject<MapView>;
  userLocation: { latitude: number; longitude: number } | null;
  showTransitLayer: boolean;
  stations: any[];
  selectedStationId: string | null;
  onStationPress: (id: string) => void;
  mode: string;
  commuteSuggestions: any[];
  selectedSuggestionIndex: number;
  routeCoords: { latitude: number; longitude: number }[];
}

const MapComponent = ({
  mapRef,
  userLocation,
  showTransitLayer,
  stations,
  selectedStationId,
  onStationPress,
  mode,
  commuteSuggestions,
  selectedSuggestionIndex,
  routeCoords,
}: MapComponentProps) => {
  
  const stationMarkers = useMemo(() => stations.map((s, index) => (
    <Marker 
      key={`station-${s.id}-${index}`} 
      coordinate={s.coordinate} 
      onPress={() => onStationPress(s.id)}
    >
      <View style={[
        styles.markerWrap, 
        s.type === 'DC Fast' && styles.markerFast, 
        selectedStationId === s.id && styles.markerSelected
      ]}>
        <Ionicons name="flash" size={14} color={EV.bg} />
      </View>
    </Marker>
  )), [stations, selectedStationId, onStationPress]);

  const transitLayers = useMemo(() => {
    if (!showTransitLayer) return null;
    return (
      <>
        {Object.keys(RAIL_SHAPES).map(lineId => (
          <Polyline 
            key={`transit-line-${lineId}`} 
            coordinates={RAIL_SHAPES[lineId]} 
            strokeColor={LINE_COLORS[lineId]} 
            strokeWidth={3} 
            lineDashPattern={[1]}
            zIndex={1}
          />
        ))}
        {JEEP_SHAPES.map((shape, idx) => (
          <Polyline 
            key={`jeep-shape-${idx}`} 
            coordinates={shape} 
            strokeColor={EV.info} 
            strokeWidth={2} 
            lineDashPattern={[2, 4]}
            zIndex={0}
          />
        ))}
        {TRAIN_STATIONS.map(s => (
          <Marker 
            key={`transit-dot-${s.id}`} 
            coordinate={s.coordinate} 
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={2}
          >
            <View style={[styles.transitDot, { backgroundColor: LINE_COLORS[s.line] }]} />
          </Marker>
        ))}
      </>
    );
  }, [showTransitLayer]);

  const routeLayer = useMemo(() => {
    if (mode === 'commute') {
      if (commuteSuggestions.length === 0) return null;
      return commuteSuggestions[selectedSuggestionIndex]?.steps.map((step: any, idx: number) => {
        const coords = step.coordinates || [];
        return coords.length > 1 ? (
          <Polyline key={`step-${idx}`} coordinates={coords} strokeColor={step.color} strokeWidth={4} />
        ) : null;
      });
    } else {
      if (routeCoords.length <= 1) return null;
      return <Polyline coordinates={routeCoords} strokeColor={EV.primary} strokeWidth={4} />;
    }
  }, [mode, commuteSuggestions, selectedSuggestionIndex, routeCoords]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      provider={undefined}
      initialRegion={{
        latitude: userLocation?.latitude ?? 12.8797,
        longitude: userLocation?.longitude ?? 121.7740,
        latitudeDelta: userLocation ? 0.05 : 8,
        longitudeDelta: userLocation ? 0.05 : 8,
      }}
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
    >
      {transitLayers}
      {stationMarkers}
      {routeLayer}
    </MapView>
  );
};

const styles = StyleSheet.create({
  markerWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: EV.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  markerFast: {
    backgroundColor: EV.warning,
  },
  markerSelected: {
    backgroundColor: EV.accent,
    transform: [{ scale: 1.2 }],
    borderWidth: 3,
  },
  transitDot: {
    width: 10, 
    height: 10, 
    borderRadius: 5, 
    borderWidth: 1.5, 
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 1,
  },
});

export default React.memo(MapComponent);
