/// <reference path="JSProvider.d.ts" />
"use strict";

import pyapi from "./pyapi";
import * as utils from "./utils";


function GetPythonVersions(process) {
    let all_versions = [];
    for (let module of process.Modules) {
        let module_name = module.Name;
        let name_split = module_name.split('\\');
        let filename = name_split[name_split.length - 1];
        let m = filename.match(/python(3\d+)(?:_d)?.dll/i);
        // host.diagnostics.debugLog(`check ${filename}, m=${m}\n`)
        if (m === null) {
            continue;
        }
        all_versions.push([parseInt(m[1]), filename]);
    }
    return all_versions;
}

function CheckPython(process) {
    let versions = GetPythonVersions(process);
    if (versions.length === 0)
        throw new Error('No Python found');
    if (versions.length > 1)
        throw new Error(`Multiple Python found (${versions})`);
    const createNamespace = pyapi[versions[0][0]];
    if (createNamespace === undefined)
        throw new Error(`Unsupported Python (${versions[0]})`);
    return versions[0];
}

class ThreadNamespaceExtend {
    get PythonState() {
        let process = utils.ProcessFromThread(this);
        try {
            const versions = CheckPython(process);
            const createApi = pyapi[versions[0]];
            const api = createApi(this, versions[1]);
            return new PythonStateNamespace(api, this);
        } catch (e) {
            return e.message;
        }
    }
}

class PythonStateNamespace {
    constructor(api, thread) {
        this.__api = api;
        this.__thread = thread;
    }

    toString() {
        if (this.IsPythonThread) {
            return "";
        } else {
            return "[x] Not python thread";
        }
    }

    get IsPythonThread() {
        return this.tstate !== null;
    }

    get Stack() {
        return new PythonStack(this.__api, this.tstate);
    }

    // get HasGIL() {
    //     // TODO
    //     return false;
    // }

    get tstate() {
        let teb = this.__thread.Environment.EnvironmentBlock;
        return this.__api.PyGILState_GetThisThreadState(teb);
    }
}

class PythonStack {
    constructor(api, tstate) {
        this.__api = api;
        this.__tstate = tstate;
    }

    toString() {
        let firstFrame = this.__api.my_FrameFromTstate(this.__tstate);
        let wrappedFrame = new WrappedPyFrameObject(this.__api, firstFrame);
        return `last state: ${wrappedFrame.toString()}`;
    }

    * [Symbol.iterator]() {
        if (this.__tstate === null) return;
        let frame = this.__api.my_FrameFromTstate(this.__tstate);
        while (frame.compareTo(0) !== 0) {
            yield new WrappedPyFrameObject(this.__api, frame);
            if (frame.f_back !== undefined) {
                frame = frame.f_back;
            } else {
                frame = frame.previous;
            }
        }
    }
}

class WrappedPyFrameObject {
    constructor(api, raw) {
        this.__api = api;
        this.raw = raw;
    }

    toString() {
        let filename = this.Filename;
        let line = this.LineNumber;
        let functionName = this.Function;
        if (line < 0) line = '???';
        return `in ${functionName} (File '${filename}', line ${line})`;
    }

    get Filename() {
        let code = this.raw.f_code;
        if (code.compareTo(0) !== 0) {
            let co_filename = code.co_filename;
            if (co_filename.compareTo(0) !== 0 && this.__api.PyUnicode_Check(co_filename)) {
                return this.__api.my_ReadUnicodeText(co_filename);
            }
        }
        return '???';
    }

    get LineNumber() {
        return this.__api.PyFrame_GetLineNumber(this.raw);
    }

    get Function() {
        let code = this.raw.f_code;
        if (code.compareTo(0) !== 0) {
            let co_name = code.co_name;
            if (co_name.compareTo(0) !== 0 && this.__api.PyUnicode_Check(co_name)) {
                return this.__api.my_ReadUnicodeText(co_name);
            }
        }
        return '???';
    }
}

export function PythonStacks(tid) {
    try {
        CheckPython(host.currentProcess);
    } catch (e) {
        host.diagnostics.debugLog(`Error: ${e.message}\n`);
        return e.message;
    }
    if (tid === undefined) {
        return host.currentProcess.Threads
            .Where(x => x.PythonState.IsPythonThread)
            .Select(x => x.PythonState.Stack);
    }
    return host.currentProcess.Threads[tid].PythonState.Stack;
}

export function invokeScript() {
}

export function initializeScript() {
    host.diagnostics.debugLog('load\n');
    return [
        new host.apiVersionSupport(1, 7),
        new host.namedModelParent(ThreadNamespaceExtend, 'Debugger.Models.Thread'),
        new host.functionAlias(PythonStacks, 'pystk'),
    ];
}
