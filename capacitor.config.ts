import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.nexora.mobile',
  appName: 'Nexora',
  webDir: 'dist',
  server: {
    cleartext: true,
    androidScheme: 'http',
  },
}

export default config
