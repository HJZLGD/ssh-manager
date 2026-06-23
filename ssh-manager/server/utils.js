const { spawn } = require('child_process');

function spawnSafe(command, args) {
    return new Promise((resolve, reject) => {
        const pipeIndex = args.indexOf('|');
        if (pipeIndex !== -1) {
            const cmd1 = spawn(command, args.slice(0, pipeIndex));
            const cmd2 = spawn(args[pipeIndex + 1], args.slice(pipeIndex + 2));
            cmd1.stdout.pipe(cmd2.stdin);

            let stdout = '', stderr = '';
            cmd2.stdout.on('data', (d) => { stdout += d.toString(); });
            cmd2.stderr.on('data', (d) => { stderr += d.toString(); });
            cmd2.on('close', (code) => {
                if (code === 0) resolve({ stdout, stderr, code });
                else reject(new Error(stderr || `退出码: ${code}`));
            });
            cmd2.on('error', reject);
            cmd1.on('error', reject);
        } else {
            const proc = spawn(command, args);
            let stdout = '', stderr = '';
            proc.stdout.on('data', (d) => { stdout += d.toString(); });
            proc.stderr.on('data', (d) => { stderr += d.toString(); });
            proc.on('close', (code) => {
                if (code === 0) resolve({ stdout, stderr, code });
                else reject(new Error(stderr || `退出码: ${code}`));
            });
            proc.on('error', reject);
        }
    });
}

module.exports = { spawnSafe };