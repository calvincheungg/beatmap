import { MapCanvas } from '../scene/MapCanvas';
import { Attribution } from './Attribution';
import { LoadingStatus } from './LoadingStatus';
import { MapControls } from './MapControls';
import { SearchBox } from './SearchBox';
import { SidePanel } from './SidePanel';

export function App() {
  return (
    <>
      <MapCanvas />
      <SearchBox />
      <SidePanel />
      <LoadingStatus />
      <MapControls />
      <Attribution />
    </>
  );
}
