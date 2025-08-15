import chalk from "chalk";
import { exec } from "child_process";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { promisify } from "util";
const { blueBright, greenBright, yellowBright, redBright } = chalk;

const execPromise = promisify(exec);

export async function buildLicenseInfo() {
  const licensesOutputDirectory = join(
    import.meta.dirname,
    "..",
    "src",
    "renderer",
    "assets",
  );
  await mkdir(licensesOutputDirectory, { recursive: true }); // Ensure directory exists
  const licensesOutputPath = join(licensesOutputDirectory, "licenses.json");

  // try {
  //   const exist = await stat(licensesOutputPath);
  //   if (exist?.isFile()) {
  //     console.log(
  //       blueBright(
  //         "Existing open source licenses... skip generate :",
  //         licensesOutputPath,
  //       ),
  //     );
  //     return;
  //   }
  // } catch {}

  // --- Generate Open Source Licenses ---
  console.log(blueBright("Generating open source licenses..."));

  try {
    const { stdout } = await execPromise(
      "pnpm license-checker-rseidelsohn --excludePackages ';doujin-menu;' --json ",
    );
    const rawLicenses = JSON.parse(stdout);
    const processedLicenses = {};

    for (const key in rawLicenses) {
      if (rawLicenses.hasOwnProperty(key)) {
        const licenseData = rawLicenses[key];
        let licenseText = "";

        if (licenseData.licenseFile) {
          try {
            licenseText = await readFile(licenseData.licenseFile, "utf-8");
          } catch (fileError) {
            console.warn(
              yellowBright(
                `Could not read license file for ${key}: ${fileError.message}`,
              ),
            );
          }
        }
        const lastAtIndex = key.lastIndexOf("@");
        let name = key;
        let version = "";

        if (lastAtIndex > 0) {
          // Ensure it's not the first character (for @scope)
          name = key.substring(0, lastAtIndex);
          version = key.substring(lastAtIndex + 1);
        }

        processedLicenses[key] = { ...licenseData, name, version, licenseText };
      }
    }

    await writeFile(
      licensesOutputPath,
      JSON.stringify(processedLicenses, null, 2),
      { flag: "w" },
    );
    console.log(
      greenBright(`Open source licenses generated at ${licensesOutputPath}`),
    );
  } catch (error) {
    console.error(redBright("Failed to generate open source licenses:"), error);
  }
}
