import * as child_process from "child_process";
import * as path from "node:path";
import { ChildProcess } from "child_process";
import { BrowserWindow, ipcMain } from "electron";
import { watch } from "original-fs";
const _isDev = import("electron-is-dev");

export interface LuneMethodData {
  type: "Method";
  method: string;
  headers: {
    [key: string]: any;
  };
}

export interface LuneInvokeData {
  type: "Invoke";
  method: string;
  headers: {
    eventId: number;
    [key: string]: any;
  };
}

export type LuneData = LuneMethodData | LuneInvokeData;

export async function bindWindowToLune(
  win: BrowserWindow,
  spawnLuneProcessDev: () => ChildProcess,
  spawnLuneProcessExecutable: () => ChildProcess,
  port: number
) {
  const isDev = (await _isDev).default;
  function spawn_lune() {
    return new Promise<undefined>((res) => {
      let lune = isDev ? spawnLuneProcessDev() : spawnLuneProcessExecutable();

      lune.stdout?.setEncoding("utf8");
      lune.stdout?.on("data", (buffer: Buffer) => {
        const output = buffer.toString();
        const lines = output.split("\n");

        lines.forEach((line) => {
          if (line) {
            if (line.startsWith("@")) {
              let sliced = line.substring(1);
              let parsed: LuneData = JSON.parse(sliced);

              if (parsed.type === "Method") {
                if (parsed.method === "ready") {
                  res(undefined);
                } else if (parsed.method === "kill") {
                  lune.kill();
                }

                win.webContents.send(parsed.method, parsed.headers);
              } else if (parsed.type === "Invoke") {
                win.webContents.send("invoke:" + parsed.method, parsed.headers);
              }
            } else {
              console.log(line);
            }
          }
        });
      });

      lune.stderr?.setEncoding("utf8");
      lune.stderr?.on("data", (buffer: Buffer) => {
        const output = buffer.toString();
        const lines = output.split("\n");

        lines.forEach((line) => {
          if (line) {
            console.error(line);
          }
        });
      });
    });
  }

  ipcMain.on("load", (_event) => {
    fetch("http://localhost:" + port + "/kill", {
      method: "POST",
    })
      .finally(async () => {
        await spawn_lune();

        await fetch("http://localhost:" + port).catch((err) =>
          console.error(err)
        );
      })
      .catch((_) => {
        // this is just silly.
      });
  });

  ipcMain.on("toLune", async (_event, channel: string, value: any) => {
    fetch("http://localhost:" + port + "/channel", {
      method: "POST",
      headers: {
        channel,
        value: JSON.stringify(value),
      },
    }).catch((_) => {
      // this is just silly.
    });
  });
}

export async function watchForChanges(
  win: BrowserWindow,
  absoluteRootDirectory: string
) {
  const isDev = (await _isDev).default;
  if (!isDev) return;

  watch(absoluteRootDirectory, { recursive: true }, (eventType, filename) => {
    if (filename && path.extname(filename) === ".luau") {
      win.webContents.send("refresh");
    }
  });
}
