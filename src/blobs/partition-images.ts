import assert from 'assert'
import _ from 'lodash'
import path from 'path'
import { getHostBinPath } from '../config/paths'
import { getFsType, getPartitionSize, hasStandardPartition } from '../frontend/source'
import { assertDefined, objGet } from '../util/data'
import { isFile } from '../util/fs'
import { Partition, STANDARD_PARTITION_IMAGES } from '../util/partitions'
import { spawnAsync } from '../util/process'

// output of 'lpdump --json'
interface LpDump {
  partitions: LpInfo[]
  groups: LpGroupInfo[]
  block_devices: BlockDeviceInfo[]
  super_device: SuperDeviceInfo
}

interface LpInfo {
  name: string
  group_name: string
  is_dynamic: boolean
}

interface LpGroupInfo {
  name: string
  maximum_size?: number
}

interface BlockDeviceInfo {
  name: string
  size: number
  block_size: number
  alignment: number
}

interface SuperDeviceInfo {
  name: string
  total_size: number
}

export async function getPartitionMakefileLines(unpackedOsImagePath: string) {
  let superEmptyImg = path.join(unpackedOsImagePath, 'super_empty.img')
  assert(await isFile(superEmptyImg), superEmptyImg)
  let lpdumpBin = await getHostBinPath('lpdump')
  let dumpJson = await spawnAsync(lpdumpBin, ['--json', superEmptyImg])
  let dump = JSON.parse(dumpJson, (key, value) => {
    switch (key) {
      case 'alignment':
      case 'block_size':
      case 'maximum_size':
      case 'size':
      case 'total_size':
        assert(typeof value === 'string', superEmptyImg)
        return Number(value)
    }
    return value
  }) as LpDump

  let slots = ['_a', '_b']

  let res: string[] = []
  const PARTITION_GROUP_NAME = 'google_dynamic_partitions'
  {
    assert(dump.super_device.name === 'super', superEmptyImg)
    assert(dump.block_devices.length === 1, superEmptyImg)
    let superBlockDevice = dump.block_devices[0]
    assert(superBlockDevice.name === 'super', superEmptyImg)
    assert(superBlockDevice.block_size === 4096, superEmptyImg)
    assert(superBlockDevice.alignment === 1048576, superEmptyImg)
    assert(superBlockDevice.size > 0, superEmptyImg)
    assert(dump.super_device.total_size === superBlockDevice.size, superEmptyImg)
    res.push('BOARD_SUPER_PARTITION_SIZE := ' + superBlockDevice.size)
    res.push('BOARD_SUPER_PARTITION_ERROR_LIMIT := ' + (superBlockDevice.size - /* 500 MiB */ 500 * (1 << 20)))
  }
  {
    let groupsByName = _.keyBy(dump.groups, 'name')
    assert(dump.groups.length === 3, superEmptyImg)
    assert(Object.keys(groupsByName).length === 3, superEmptyImg)
    let defaultInfo = groupsByName['default']
    assert(defaultInfo !== undefined && defaultInfo.maximum_size === undefined, superEmptyImg)

    let dynamicPartitionsSize: number | undefined

    for (let slot of slots) {
      let groupInfo = groupsByName[PARTITION_GROUP_NAME + slot]
      assert(groupInfo !== undefined, superEmptyImg)
      if (dynamicPartitionsSize === undefined) {
        dynamicPartitionsSize = assertDefined(groupInfo.maximum_size, superEmptyImg)
      } else {
        assert(dynamicPartitionsSize === groupInfo.maximum_size, superEmptyImg)
      }
    }
    res.push(`BOARD_SUPER_PARTITION_GROUPS := ${PARTITION_GROUP_NAME}`)
    res.push(`BOARD_${PARTITION_GROUP_NAME.toUpperCase()}_SIZE := ` + assertDefined(dynamicPartitionsSize))
  }
  {
    let lpByName = _.keyBy(dump.partitions, 'name')
    let baseLpNames: string[] = []
    for (let lpName of Object.keys(lpByName)) {
      assert(lpName.length >= 3 && (lpName.endsWith('_a') || lpName.endsWith('_b')), lpName)
      if (lpName.endsWith('_a')) {
        baseLpNames.push(lpName.slice(0, -2))
      }
    }
    assert(dump.partitions.length === baseLpNames.length * 2, superEmptyImg)

    for (let baseLpName of baseLpNames) {
      for (let slot of slots) {
        let info = objGet(lpByName, baseLpName + slot)
        assert(info.group_name === PARTITION_GROUP_NAME + slot, superEmptyImg)
        assert(info.is_dynamic, superEmptyImg)
      }
    }
    res.push(`BOARD_${PARTITION_GROUP_NAME.toUpperCase()}_PARTITION_LIST := ` + baseLpNames.join(' '))
    res.push('')
    for (let partition of baseLpNames) {
      if (partition.endsWith('_dlkm')) {
        res.push('BOARD_USES_' + partition.toUpperCase() + 'IMAGE := true')
        res.push('TARGET_COPY_OUT_' + partition.toUpperCase() + ' := ' + partition)
      }
    }
    let fsTypeLines = baseLpNames.map(async partition => {
      let fsType = await getFsType(unpackedOsImagePath, partition)
      return 'BOARD_' + partition.toUpperCase() + 'IMAGE_FILE_SYSTEM_TYPE := ' + fsType
    })
    res.push('')
    res.push(...(await Promise.all(fsTypeLines)))
    res.push('')

    let lpNamesSet = new Set(baseLpNames)
    for (let partition of STANDARD_PARTITION_IMAGES) {
      if (lpNamesSet.has(partition)) {
        continue
      }
      if (!(await hasStandardPartition(unpackedOsImagePath, partition))) {
        continue
      }
      let partNameInfix = partition.toUpperCase()
      if (partition === Partition.Dtbo) {
        partNameInfix += 'IMG'
      } else if (partition === Partition.InitBoot) {
        partNameInfix += '_IMAGE'
      } else {
        partNameInfix += 'IMAGE'
      }
      let partSize = `0x${(await getPartitionSize(unpackedOsImagePath, partition)).toString(16)}`
      res.push(`BOARD_${partNameInfix}_PARTITION_SIZE := ${partSize}`)
    }
  }

  return res
}
