import { confirm } from '@inquirer/prompts'
import { Command, Flags } from '@oclif/core'
import assert from 'assert'
import chalk from 'chalk'
import { promises as fs } from 'fs'
import getFolderSize from 'get-folder-size'
import path from 'path'
import prettyBytes from 'pretty-bytes'
import { loadDeviceConfigs } from '../config/device'
import { IMAGE_DOWNLOAD_DIR, UNPACKED_IMAGES_DIR } from '../config/paths'
import { getUnpackedImageDirName } from '../frontend/source'
import { ImageType, loadBuildIndex } from '../images/build-index'
import { DeviceImage } from '../images/device-image'
import { log } from '../util/log'
import { spawnAsyncNoOut } from '../util/process'

export default class TrimImages extends Command {
  static description = 'Delete unused device images'

  static flags = {
    dirsOnly: Flags.boolean({
      description: 'Ignore image files',
    }),
    allDirs: Flags.boolean({
      description: 'Remove all unpacked image directories. --keep flags take precedence over this flag',
    }),
    keep: Flags.string({
      description: 'Image files and unpacked images that should be kept, treated as case-insensitive regex',
      char: 'k',
      multiple: true,
      default: [],
    }),
    keepDirs: Flags.string({
      description: 'Unpacked images that should be kept, treated as case-insensitive regex',
      multiple: true,
      default: [],
    }),
    keepFiles: Flags.string({
      description: 'Image files that should be kept, treated as case-insensitive regex',
      multiple: true,
      default: [],
    }),
    noConfirm: Flags.boolean({ description: 'Skip confirmation' }),
  }

  async run() {
    let requiredFactoryImages = new Set<string>()
    let requiredUnpackedImages = new Set<string>()

    let cmd = await this.parse(TrimImages)

    let devices = await loadDeviceConfigs(['all'])
    let buildIndex = await loadBuildIndex()

    for (let deviceConfig of devices) {
      let buildIds = [deviceConfig.device.build_id]
      let backportBuildId = deviceConfig.device.backport_build_id
      if (backportBuildId !== undefined) {
        buildIds.push(backportBuildId)
      }

      for (let buildId of buildIds) {
        let deviceImage = DeviceImage.get(buildIndex, deviceConfig, buildId, ImageType.Factory)
        requiredFactoryImages.add(deviceImage.fileName)
        requiredFactoryImages.add(deviceImage.fileName + '.tmp')
        if (!cmd.flags.allDirs) {
          requiredUnpackedImages.add(getUnpackedImageDirName(deviceImage))
        }
      }
    }

    let jobs: Promise<void>[] = []

    let keepDirs = cmd.flags.keep.concat(cmd.flags.keepDirs).map(r => new RegExp(r, 'i'))
    let keepFiles = cmd.flags.keep
      .concat(cmd.flags.keepFiles)
      .concat(['.find-ignore'])
      .map(r => new RegExp(r, 'i'))

    let filesToRm: SizedEntry[] = []
    let dirsToRm: SizedEntry[] = []

    let sumFileSize = 0

    if (!cmd.flags.dirsOnly) {
      for (let de of await fs.readdir(IMAGE_DOWNLOAD_DIR, { withFileTypes: true })) {
        if (de.isFile() && !requiredFactoryImages.has(de.name) && !keepFiles.find(r => r.test(de.name))) {
          let filePath = path.join(de.parentPath, de.name)
          let size = (await fs.stat(filePath)).size
          filesToRm.push({ name: de.name, path: filePath, size })
          sumFileSize += size
        }
      }
    }

    let sumDirSize = 0

    for (let de of await fs.readdir(UNPACKED_IMAGES_DIR, { withFileTypes: true })) {
      if (de.isDirectory() && !requiredUnpackedImages.has(de.name) && !keepDirs.find(r => r.test(de.name))) {
        let dirPath = path.join(de.parentPath, de.name)
        let dirSizeRes = await getFolderSize(dirPath)
        assert(dirSizeRes.errors === null, dirPath)
        let size = dirSizeRes.size
        dirsToRm.push({ name: de.name, path: dirPath, size })
        sumDirSize += size
      }
    }

    if (dirsToRm.length > 0) {
      dirsToRm.sort((a, b) => a.name.localeCompare(b.name))
      log(chalk.bold(`Unpacked images that are staged for removal, sum size ${prettyBytes(sumDirSize)}:`))
      logSizedEntries(dirsToRm)
      log('\n')
    }
    if (filesToRm.length > 0) {
      filesToRm.sort((a, b) => a.name.localeCompare(b.name))
      log(chalk.bold(`Image files that are staged for removal, sum size ${prettyBytes(sumFileSize)}:`))
      logSizedEntries(filesToRm)
      log('\n')
    }

    if (dirsToRm.length + filesToRm.length === 0) {
      log('Nothing to do')
      return
    }

    log(`Total size of staged images: ${prettyBytes(sumFileSize + sumDirSize)}\n`)

    if (!cmd.flags.noConfirm) {
      await confirm({ message: 'Proceed with removal?' })
    }

    filesToRm.forEach(e => jobs.push(fs.rm(e.path)))

    let rmUnpackedDir = async (dir: string) => {
      await spawnAsyncNoOut('chmod', ['-R', 'u+w', dir])
      await fs.rm(dir, { recursive: true, force: true })
    }

    dirsToRm.forEach(e => {
      jobs.push(rmUnpackedDir(e.path))
    })

    await Promise.all(jobs)
  }
}

interface SizedEntry {
  name: string
  path: string
  size: number
}

function logSizedEntries(arr: SizedEntry[]) {
  arr.forEach(e =>
    log(`${prettyBytes(e.size, { minimumFractionDigits: 2, maximumFractionDigits: 2, fixedWidth: 10 })} ${e.name}`),
  )
}
