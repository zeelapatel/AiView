import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectStats } from '@shared/schema';

const execAsync = promisify(exec);

export class RepositoryAnalyzer {
  private tempDir: string;

  constructor(tempDir: string = path.join(process.cwd(), 'analysis_temp')) {
    this.tempDir = tempDir;
  }

  async analyze(repositoryUrl: string, branch: string = 'main'): Promise<{
    fileCount: number;
    totalLines: number;
    stats: ProjectStats;
    analysisDate: Date;
  }> {
    const repoName = repositoryUrl.split('/').pop()?.replace('.git', '') || 'repo';
    const repoPath = path.join(this.tempDir, Date.now().toString(), repoName);

    try {
      // Create temp directory if it doesn't exist
      await fs.mkdir(path.dirname(repoPath), { recursive: true });

      // Clone the repository
      await execAsync(`git clone --depth 1 --branch ${branch} ${repositoryUrl} "${repoPath}"`);

      // Get file statistics
      const stats = await this.getRepositoryStats(repoPath);

      // Cleanup
      await fs.rm(repoPath, { recursive: true, force: true });

      return {
        ...stats,
        analysisDate: new Date()
      };
    } catch (error) {
      // Cleanup on error
      await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  private async getRepositoryStats(repoPath: string) {
    const stats = {
      fileCount: 0,
      totalLines: 0,
      stats: {
        jsFiles: 0,
        jsonFiles: 0,
        mdFiles: 0
      }
    };

    async function countLines(filePath: string): Promise<number> {
      const content = await fs.readFile(filePath, 'utf-8');
      return content.split('\n').length;
    }

    async function processDirectory(dirPath: string) {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and .git directories
          if (entry.name !== 'node_modules' && entry.name !== '.git') {
            await processDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          stats.fileCount++;
          const extension = path.extname(entry.name).toLowerCase();
          const lines = await countLines(fullPath);
          stats.totalLines += lines;

          switch (extension) {
            case '.js':
            case '.jsx':
            case '.ts':
            case '.tsx':
              stats.stats.jsFiles++;
              break;
            case '.json':
              stats.stats.jsonFiles++;
              break;
            case '.md':
            case '.markdown':
              stats.stats.mdFiles++;
              break;
          }
        }
      }
    }

    await processDirectory(repoPath);
    return stats;
  }
} 