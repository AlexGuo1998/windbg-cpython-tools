/// <reference path="JSProvider.d.ts" />
"use strict";

export function inspect(x, title = "...") {
    const log = host.diagnostics.debugLog;
    log("========================================\n");
    log(`inspect: ${x} (${title})\n\n`);
    for (const [key, value] of Object.entries(x)) {
        log(`${key}: ${value}\n`);
    }
    log("========================================\n");
}

export function TlsGetValue(teb, tlsIndex) {
    if (tlsIndex < 0x40) {
        return teb.TlsSlots[tlsIndex];
    } else if (tlsIndex >= 0x440) {
        throw new RangeError(`Invalid tls slot ${tlsIndex}`);
    } else {
        const expansion = teb.TlsExpansionSlots;
        if (expansion.address.compareTo(0) === 0) {
            return 0;
        }
        return expansion.add(tlsIndex - 0x40).dereference();
    }
}

export function ProcessFromThread(thread) {
    // a hack. is `currentSession` correct?
    const pid = thread.Environment.EnvironmentBlock.ClientId.UniqueProcess.address;
    return host.currentSession.Processes[pid];
}
