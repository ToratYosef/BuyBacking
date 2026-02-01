#!/usr/bin/env node
const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");

const DEFAULT_ROOTS = ["assets", "public", "sell", "iphone", "ipad", "samsung", "watch"];

const isWebpHeader = (buffer) => {
  if (!buffer || buffer.length < 12) return false;
  return (
    buffer.slice(0, 4).toString("ascii") === "RIFF" &&
    buffer.slice(8, 12).toString("ascii") === "WEBP"
  );
};

const isJpegHeader = (buffer) =>
  buffer && buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

const isPngHeader = (buffer) =>
  buffer &&
  buffer.length >= 8 &&
  buffer[0] === 0x89 &&
  buffer[1] === 0x50 &&
  buffer[2] === 0x4e &&
  buffer[3] === 0x47 &&
  buffer[4] === 0x0d &&
  buffer[5] === 0x0a &&
  buffer[6] === 0x1a &&
  buffer[7] === 0x0a;

const shouldProcess = (buffer) => isJpegHeader(buffer) || isPngHeader(buffer);

const walk = async (dir, results = []) => {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return results;
    throw error;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, results);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".webp")) {
      results.push(fullPath);
    }
  }
  return results;
};

const convertFile = async (filePath) => {
  const data = await fs.readFile(filePath);
  if (isWebpHeader(data)) {
    return { filePath, status: "skip", reason: "already webp" };
  }
  if (!shouldProcess(data)) {
    return { filePath, status: "skip", reason: "unsupported header" };
  }

  const tempPath = `${filePath}.tmp`;
  await sharp(filePath).webp({ quality: 82 }).toFile(tempPath);
  await fs.rename(tempPath, filePath);
  return { filePath, status: "converted" };
};

const parseRoots = () => {
  const args = process.argv.slice(2);
  if (!args.length) return DEFAULT_ROOTS;
  return args;
};

const run = async () => {
  const roots = parseRoots();
  const cwd = process.cwd();
  const files = [];
  for (const root of roots) {
    const resolved = path.resolve(cwd, root);
    await walk(resolved, files);
  }

  if (!files.length) {
    console.log("No .webp files found.");
    return;
  }

  let converted = 0;
  let skipped = 0;
  for (const filePath of files) {
    try {
      const result = await convertFile(filePath);
      if (result.status === "converted") {
        converted += 1;
        console.log(`converted: ${path.relative(cwd, filePath)}`);
      } else {
        skipped += 1;
        console.log(`skipped (${result.reason}): ${path.relative(cwd, filePath)}`);
      }
    } catch (error) {
      skipped += 1;
      console.warn(`failed: ${path.relative(cwd, filePath)} (${error.message})`);
    }
  }

  console.log(`\nDone. Converted: ${converted}. Skipped: ${skipped}.`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
