import { useEffect } from 'react';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config';
import { loadEvents } from '../data/events';
import { MapView } from '../scene/MapView';
import { useMapStore } from '../state/mapStore';
import { Attribution } from './Attribution';
import { LoadingStatus } from './LoadingStatus';
import { MapControls } from './MapControls';
import { FilterBar } from './FilterBar';
import { SearchBox } from './SearchBox';
import { SidePanel } from './SidePanel';

export function App() {
  useEffect(() => {
    void loadEvents(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY).then((events) => useMapStore.getState().setEvents(events));
  }, []);

  return (
    <>
      <MapView />
      <div id="search">
        <SearchBox />
        <FilterBar />
      </div>
      <SidePanel />
      <LoadingStatus />
      <MapControls />
      <Attribution />
    </>
  );
}
