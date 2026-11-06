import { MapCanvas } from '../scene/MapCanvas';
import { Attribution } from './Attribution';
import { LoadingStatus } from './LoadingStatus';
import { RotateControls } from './RotateControls';

export function App() {
  return (
    <>
      <MapCanvas />
      <LoadingStatus />
      <RotateControls />
      <Attribution />
    </>
  );
}
