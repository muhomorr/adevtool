import { Command, Flags } from '@oclif/core'
import assert from 'assert'
import * as fs from 'fs/promises'
import { copyKernelInner } from '../blobs/kernel'
import { DEVICE_CONFIGS_FLAG_WITH_BUILD_ID, getDeviceBuildId, loadDeviceConfigs2 } from '../config/device'
import { prepareFactoryImages } from '../frontend/source'
import { loadBuildIndex } from '../images/build-index'
import { assertDefined } from '../util/data'
import { isDirectory } from '../util/fs'
import { PathResolver } from '../util/partitions'

export default class ExtractKernel extends Command {
  static flags = {
    outDir: Flags.file({
      char: 'o',
      required: true,
    }),
    ...DEVICE_CONFIGS_FLAG_WITH_BUILD_ID,
  }

  async run() {
    let { flags } = await this.parse(ExtractKernel)
    let devices = await loadDeviceConfigs2(flags)
    assert(devices.length === 1)
    let res = await prepareFactoryImages(await loadBuildIndex(), devices)
    let images = assertDefined(res.get(getDeviceBuildId(devices[0])))
    let pathResolver = new PathResolver(images.unpackedFactoryImageDir)

    await fs.mkdir(flags.outDir, { recursive: true })
    await copyKernelInner(pathResolver, flags.outDir)
  }
}
