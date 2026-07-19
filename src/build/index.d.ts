import type { Metafile } from 'esbuild';

export type CopyAsset = { from: string; to: string };

export type DevServerCors = { origin?: string };

export type DevServerConfig = {
  enable?: boolean;
  livereload?: boolean;
  host?: string;
  port?: number;
  cacheHeaders?: boolean;
  keyfile?: string;
  certfile?: string;
  cors?: DevServerCors;
  https?: boolean;
};

export type CompressionConfig = {
  type?: string;
  level?: number;
};

export type CSPConfig = {
  enable?: boolean;
  requireTrustedTypes?: boolean;
  trustedTypes?: string[];
  styleSrc?: Array<string | typeof self>;
  fontSrc?: Array<string | typeof self>;
};

export type BuildConfig = {
  entryPoint?: string;
  entryPointCSS?: string;
  indexHTML?: string;
  outdir?: string;
  minify?: boolean;
  sourcemap?: boolean;
  copy?: CopyAsset[];
  devServer?: DevServerConfig;
  compression?: boolean;
  compressionConfig?: CompressionConfig;
  csp?: CSPConfig;
  devWarnings?: boolean;
  securityLevel?: number;
  onStart?: () => void | Promise<void>;
  onEnd?: (results?: any) => void | Promise<void>;
  define?: Record<string, any>;
  basedir?: string;
  appJSFilename?: string;
  appCSSFilename?: string;
  compressionLabel?: string;
  compressionExt?: string;
  isDev?: boolean;
};

export default function build(config?: BuildConfig): Promise<void>;

/**
 * buildRoutes helper used by the build script
 * @internal
 */
export default function buildRoutes(
  config: {
    basedir: string;
    outdir: string;
    entryPoint: string;
    entryPointCSS?: string;
    indexHTML: string;
    devServer: DevServerConfig;
    devWarnings?: boolean;
    securityLevel?: number;
    compression?: boolean;
    compressionConfig?: CompressionConfig;
    compressionLabel?: string;
    isDev?: boolean;
    csp?: CSPConfig;
  },
  inputs: Record<string, any>,
  appOutputs: Array<[string | undefined, string]>
): Promise<void>;
