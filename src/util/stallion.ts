import { DeviceConfig } from '../config/device'

export function isStallion(config: DeviceConfig) {
  return config.device.name === 'stallion'
}
