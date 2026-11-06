import { useEffect } from 'react';
import { EVENTS_URL } from '../config';
import { loadEvents } from '../data/events';
import { MapView } from '../scene/MapView';
import { useMapStore } from '../state/mapStore';
import { Attribution } from './Attribution';
import { LoadingStatus } from './LoadingStatus';
import { MapControls } from './MapControls';
import { SearchBox } from './SearchBox';
import { SidePanel } from './SidePanel';

export function App() {
  useEffect(() => {
    void loadEvents(EVENTS_URL).then((events) => useMapStore.getState().setEvents(events));
  }, []);

  return (
    <>
      <MapView />
      <SearchBox />
      <SidePanel />
      <LoadingStatus />
      <MapControls />
      <Attribution />
    </>
  );
}
