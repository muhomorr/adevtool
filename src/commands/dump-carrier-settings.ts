import { Command, flags } from '@oclif/command'
import path from 'path'

import { DEVICE_CONFIG_FLAGS, loadDeviceConfigs, getDeviceBuildId } from '../config/device'
import { decodeConfigs } from '../blobs/carrier'
import { forEachDevice } from '../frontend/devices'
import { loadBuildIndex, BuildIndex } from '../images/build-index'
import { prepareFactoryImages } from '../frontend/source'
import { assert } from 'console'
import { exists } from '../util/fs'
import { VENDOR_MODULE_SKELS_DIR, CARRIER_SETTINGS_VENDOR_DIR } from '../config/paths'

export default class DumpCarrierSettings extends Command {
  static description = 'generate protoc dumps of configs from factory image.'

  static flags = {
    buildId: flags.string({
      description: 'specify build ID',
      char: 'b',
    }),
    out: flags.string({
      char: 'o',
    }),
    ...DEVICE_CONFIG_FLAGS,
  }

  async run() {
    let { flags } = this.parse(DumpCarrierSettings)
    let index: BuildIndex = await loadBuildIndex()
    let devices = await loadDeviceConfigs(flags.devices)
    await forEachDevice(
      devices,
      false,
      async config => {
        if (config.device.has_cellular) {
          const build_id = flags.buildId !== undefined ? flags.buildId : config.device.build_id
          const images = await prepareFactoryImages(index, [config], [build_id])
          const deviceImages = images.get(getDeviceBuildId(config, build_id))!
          const stockCsPath = path.join(deviceImages.unpackedFactoryImageDir, CARRIER_SETTINGS_VENDOR_DIR)
          const defaultOutDir = path.join(
            VENDOR_MODULE_SKELS_DIR,
            config.device.vendor,
            config.device.name,
            'proprietary',
            CARRIER_SETTINGS_VENDOR_DIR,
          )
          const outDir = flags.out !== undefined ? path.join(flags.out, config.device.name) : defaultOutDir
          assert(await exists(stockCsPath))
          await decodeConfigs(stockCsPath, outDir)
        } else {
          this.log(`${config.device.name} is not supported due to lack of mobile connectivity`)
        }
      },
      config => `${config.device.name} ${flags.buildId !== undefined ? flags.buildId : config.device.build_id}`,
    )
  }
}
