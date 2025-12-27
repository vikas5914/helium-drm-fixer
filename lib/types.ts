export interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  html_url: string;
  assets: GitHubAsset[];
}

export interface VersionCache {
  tag: string;
  name: string;
  downloadedAt: number;
  checksum?: string;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
}
