import path from 'node:path';
import { readFile, readdir, writeFile, mkdir, cp, stat } from 'node:fs/promises';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

const asyncGzip = promisify(gzip);

export default async function copyFiles(copyFiles = [], outputFileNames) {
  return Promise.all(copyFiles.flatMap(async (file) => {
    let { from, to, transform, gzip } = file;
    const isGlob = from.includes('*');
    if (!isGlob) {
      const hasExtension = !!getExtension(to);
      if (!hasExtension) to = path.join(to, from.split('/').pop());

      // just copy
      if (typeof transform !== 'function') {
        await mkdir(to.split('/').slice(0, -1).join('/'), { recursive: true });
        await cp(from, to);
        if (gzip) await gzipFile(to);
        return {
          copiedFile: true,
          gzip,
          fileName: to.split('/').pop(),
          filePath: to,
          entryFilePath: from
        };
      }

      // transform and copy
      const content = await readFile(from, 'utf-8');
      const transformed = await transform({
        content,
        outputFileNames
      });
      await mkdir(to.split('/').slice(0, -1).join('/'), { recursive: true });
      await writeFile(to, transformed);
      if (gzip) await gzipFile(to);
      return {
        copiedFile: true,
        gzip,
        fileName: to.split('/').pop(),
        filePath: to,
        entryFilePath: from
      };
    }

    // Glob copy
    const globBase = getGlobBase(from);
    const regex = globToRegex(from);
    try {
      const files = await listFiles(globBase);
      const filtered = files.filter(file => file.match(regex) !== null);

      // just copy
      if (typeof transform !== 'function') {
        return Promise.all(filtered.map(async filePath => {
          const writePath = path.join(to, filePath.split(globBase).pop());
          await mkdir(writePath.split('/').slice(0, -1).join('/'), { recursive: true });
          await cp(filePath, writePath);
          if (gzip) await gzipFile(writePath);
          return {
            copiedFile: true,
            gzip,
            fileName: writePath.split('/').pop(),
            filePath: writePath,
            entryFilePath: from
          };
        }));
      }

      // transform and copy
      return Promise.all(filtered.map(async filePath => {
        const content = await readFile(filePath, 'utf-8');
        const transformed = await transform({
          content,
          outputFileNames
        });
        const writePath = path.join(path.resolve('.'), to, filePath.split(globBase).pop());
        file.filePath = writePath;
        await mkdir(writePath.split('/').slice(0, -1).join('/'), { recursive: true });
        await writeFile(writePath, transformed);
        if (gzip) await gzipFile(writePath);
        return {
          copiedFile: true,
          gzip,
          fileName: writePath.split('/').pop(),
          filePath: writePath,
          entryFilePath: from
        };
      }));
    } catch (e) {
      console.error(e);
    }
  }));
}

function getExtension(url) {
  if (!url.includes('.')) return '';
  const split = url.split(/[#?]/)[0].split('.');
  let ext = split.pop().trim().toLowerCase();
  if (ext === 'gz') ext = split.pop();
  return ext;
}

function getGlobBase(globStr) {
  if (globStr.startsWith('*')) return path.resolve('.');
  return path.resolve('.', globStr.split('*')[0]);
}

function globToRegex(globStr = '') {
  const length = globStr.length;
  let regexString = '';
  let char;
  for (let i = 0; i < length; i += 1) {
    char = globStr[i];

    switch (char) {
      case '/':
      case '.':
        regexString += '\\' + char;
        break;

      case '*':
        const prevChar = globStr[i - 1];
        let starCount = 1;
        while (globStr[i + 1] === '*') {
          starCount += 1;
          i += 1;
        }
        const nextChar = globStr[i + 1];
        const isGlobstar = starCount > 1                    // multiple '*''s
          && (prevChar === '/' || prevChar === undefined)   // from the start of the segment
          && (nextChar === '/' || nextChar === undefined)   // to the end of the segment

        if (isGlobstar) {
          regexString += '((?:[^/]*(?:\/|$))*)';
          i += 1;
        } else {
          regexString += '([^/]*)';
        }
        break;

      default:
        regexString += char;
    }
  }
  return new RegExp(regexString);
}

async function listFiles(dir, arr = []) {
  const files = await readdir(dir);

  await Promise.all(files.map(async file => {
    const filePath = path.join(dir, file);
    if ((await stat(filePath)).isDirectory()) return listFiles(filePath, arr);
    arr.push(filePath);
  }));

  return arr
}

async function gzipFile(file) {
  const result = await asyncGzip(await readFile(file));
  await writeFile(file, result);
}
