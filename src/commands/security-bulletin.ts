import { confirm } from '@inquirer/prompts'
import { Args, Command, Flags } from '@oclif/core'
import assert from 'assert'
import chalk from 'chalk'
import { spawnSync } from 'node:child_process'
import path from 'path'
import xml2js from 'xml2js'
import { OS_CHECKOUT_DIR } from '../config/paths'
import { maybePlural } from '../util/cli'
import { assertDefined } from '../util/data'
import { readFile } from '../util/fs'

enum Mode {
  Info = 'info',
  Apply = 'apply',
  ApplyInteractive = 'apply-interactive',
}

export class SecurityBulletin extends Command {
  static flags = {
    file: Flags.file({ char: 'f', required: true, multiple: true }),
    aospVersion: Flags.string({ required: true }),
    osManifestFile: Flags.file({ default: path.join(OS_CHECKOUT_DIR, '.repo/manifests/default.xml') }),
  }

  static args = {
    mode: Args.string({
      description: 'mode',
      required: true,
      options: Object.values(Mode),
    }),
  }

  async run() {
    let { flags, args } = await this.parse(SecurityBulletin)

    let mode = args.mode as Mode
    let projectNamePathMap = new Map<string, string>()
    {
      let manifest = await xml2js.parseStringPromise(await readFile(flags.osManifestFile))
      let projects = manifest.manifest.project as object[]
      for (let proj of projects) {
        let name = proj.$.name
        let path = proj.$.path
        projectNamePathMap.set(name, path)
      }
    }
    let failedPatches: string[] = []
    let appliedPatchesInfo: string[] = []
    let affectedRepos = new Map<string, Set<string>>()
    let patchedRepos = new Set<string>()
    let appliedPatchShas = new Set<string>()
    for (let filePath of flags.file) {
      let patchesDir = path.join(path.dirname(filePath), 'patches')
      let file = await readFile(filePath)

      let bulletin = JSON.parse(file) as SecurityBulletinObj
      let allVulns = bulletin.vulnerabilities
      if (mode === Mode.Info) {
        console.log('\n================================================================================')
        console.log(filePath)
        console.log(bulletin.title)
        console.log('published: ' + bulletin.published)
        if (allVulns === null) {
          console.log('no vulnerabilities')
        }
      }

      if (allVulns === null) {
        continue
      }

      let vulns = allVulns.filter(
        vuln => vuln.version_data === undefined || vuln.version_data[flags.aospVersion] !== undefined,
      )
      if (vulns.length === 0) {
        console.log('no vulnerabilities for ' + flags.aospVersion)
        continue
      }
      for (let vuln of vulns) {
        let vulnLines: string[] = []
        vulnLines.push((vuln.CVE ?? '<No CVE>') + ' | ' + vuln.android_id)
        vulnLines.push((vuln.type ? vuln.type + ', ' : '') + vuln.severity + ' severity')
        vulnLines.push(
          vuln.area + ' → ' + vuln.component + (vuln.subcomponent !== undefined ? ' → ' + vuln.subcomponent : ''),
        )
        if (vuln.tech_details.length === 0) {
          vulnLines.push('No details')
        } else {
          vulnLines.push('Details: ' + vuln.tech_details)
        }

        if (vuln.fix_details === undefined) {
          vulnLines.push('No fix details')
        } else {
          vulnLines.push('Fix details: ' + vuln.fix_details)
        }

        if (vuln.version_data === undefined) {
          vulnLines.push('No patches')
        } else {
          let versionData = assertDefined(vuln.version_data[flags.aospVersion])
          let branches = versionData.branches
          assert(branches.length === 1)
          let projects = branches[0].projects
          let failedCommands: string[] = []
          for (let project of projects) {
            let repo = project.repo
            let repoPath = projectNamePathMap.get(repo)
            if (repoPath === undefined) {
              repoPath = projectNamePathMap.get(repo.replaceAll('/', '_'))
            }
            vulnLines.push(
              `Repo patch${maybePlural(project.shas, '', 'es')}: ` +
                (repoPath ?? `<unknown repo ${repo}>`) +
                ' | ' +
                project.shas,
            )
            if (mode === Mode.Info) {
              console.log('\n' + vulnLines.join('\n'))
            }
            for (let sha of project.shas) {
              if (repoPath !== undefined) {
                let patches = affectedRepos.get(repoPath)
                if (patches !== undefined) {
                  patches.add(sha)
                } else {
                  patches = new Set<string>()
                  patches.add(sha)
                  affectedRepos.set(repoPath, patches)
                }
              }

              let patchFilePath = path.join(patchesDir, sha + '.patch')
              if (mode === Mode.Info) {
                continue
              }
              if (appliedPatchShas.has(sha)) {
                console.log('Already applied ' + sha)
                continue
              }
              if (mode === Mode.ApplyInteractive && (await confirm({ message: 'show patch ' + sha, default: false }))) {
                spawnSync(process.env['PAGER'] ?? 'less', [patchFilePath], { stdio: 'inherit' })
              }
              if (
                repoPath !== undefined &&
                (mode === Mode.Apply ||
                  (mode === Mode.ApplyInteractive && (await confirm({ message: 'apply patch', default: true }))))
              ) {
                if (
                  spawnSync('git', ['-C', repoPath, 'am', patchFilePath], {
                    ...(mode === Mode.ApplyInteractive && { stdio: 'inherit' }),
                  }).status === 0
                ) {
                  appliedPatchShas.add(sha)
                  patchedRepos.add(repoPath)
                } else {
                  if (
                    mode === Mode.Apply ||
                    (mode === Mode.ApplyInteractive && (await confirm({ message: 'git-am failed. Abort git-am?' })))
                  ) {
                    spawnSync('git', ['-C', repoPath, 'am', '--abort'], { stdio: 'inherit' })
                    failedCommands.push(`git -C ${repoPath} am ${patchFilePath}`)
                  }
                }
              }
            }
          }
          if (failedCommands.length > 0) {
            failedPatches.push(
              chalk.bold('Failed patch:') +
                '\n' +
                vulnLines.join('\n') +
                '\n' +
                failedCommands.map(s => `Failed command: ${s}`).join('\n'),
            )
          } else {
            appliedPatchesInfo.push('Applied patch: ' + '\n' + vulnLines.join('\n'))
          }
        }
      }
    }
    if (mode === Mode.Info) {
      console.log(
        '\nAffected repos:\n' +
          Array.from(affectedRepos)
            .sort()
            .map(([k, v]) => k + ' ' + v.size + ' ' + (v.size === 1 ? 'patch' : 'patches'))
            .join('\n'),
      )
    }

    if (mode === Mode.Apply || mode === Mode.ApplyInteractive) {
      if (appliedPatchesInfo.length > 0) {
        console.log('\n' + appliedPatchesInfo.join('\n\n'))
      }
      if (failedPatches.length > 0) {
        console.log('\n' + failedPatches.join('\n\n'))
      }
      if (patchedRepos.size > 0) {
        console.log('\nUpdated repos:\n' + Array.from(patchedRepos).sort().join('\n'))
      }
    }
  }
}

interface SecurityBulletinObj {
  title: string
  bulletin_id: string
  published: string
  vulnerabilities: Vulnerability[]
}

interface Vulnerability {
  bulletin_id: string
  CVE?: string
  area: string
  component: string
  subcomponent?: string
  patch_level: string
  android_id: string
  type?: string
  severity: string
  aosp_versions: string[]
  tech_details: string
  fix_details?: string
  version_data?: { [versionName: string]: VulnerabilityVersionData }
}

interface VulnerabilityVersionData {
  type: string
  severity: string
  patch_links: string[]
  branches: VulnVersionBranch[]
}

interface VulnVersionBranch {
  name: string
  projects: VulnProjectData[]
}

interface VulnProjectData {
  repo: string
  shas: string[]
}
