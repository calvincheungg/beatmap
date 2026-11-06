import { MapView } from '../scene/MapView';
import { Attribution } from './Attribution';
import { LoadingStatus } from './LoadingStatus';
import { MapControls } from './MapControls';
import { SearchBox } from './SearchBox';
import { SidePanel } from './SidePanel';

export function App() {
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
