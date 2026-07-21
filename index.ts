import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

if (process.env.EXPO_PUBLIC_G002_NATIVE_HARNESS === '1') {
  setTimeout(async () => {
    const { runGate0Runtime } = await import('./modules/allnewmts-lua/src/gate0-runtime');
    runGate0Runtime();
  }, 0);
}
