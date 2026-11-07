export function createRequestQueue(concurrency = 2) {
    let active = 0;
    const pending = [];
    function pump() {
        while (active < concurrency && pending.length) {
            pending.sort((left, right) => right.priority() - left.priority());
            const job = pending.shift();
            active += 1;
            Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => {
                active -= 1;
                pump();
            });
        }
    }
    return {
        run(task, { priority = () => 0 } = {}) {
            return new Promise((resolve, reject) => {
                pending.push({ task, priority, resolve, reject });
                pump();
            });
        },
        clear() {
            for (const job of pending.splice(0)) job.resolve(null);
        },
    };
}
