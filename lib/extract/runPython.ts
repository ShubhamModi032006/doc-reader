import { spawn } from 'child_process';
import path from 'path';

export function runPythonScript<T = any>(scriptName: string, args: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'python', scriptName);
    const env = { ...process.env, PYTHONPATH: process.cwd() };
    const pyProcess = spawn('python3', [scriptPath, ...args], { env });

    let stdoutData = '';
    let stderrData = '';

    pyProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pyProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pyProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python script ${scriptName} exited with code ${code}: ${stderrData}`));
      }
      try {
        const json = JSON.parse(stdoutData);
        if (json.error) {
          return reject(new Error(json.error));
        }
        resolve(json as T);
      } catch (e) {
        reject(new Error(`Failed to parse Python JSON output: ${stdoutData}`));
      }
    });

    pyProcess.on('error', (err) => {
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });
  });
}
