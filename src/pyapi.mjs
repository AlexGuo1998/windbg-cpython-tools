/// <reference path="JSProvider.d.ts" />
"use strict";

import * as utils from "./utils";

class api37 {
    constructor(moduleName, context) {
        this.moduleName = moduleName;
        this.context = context;
    }

    __check_PyObject_type(pointer, type_symbol) {
        let obType = this.Py_TYPE(pointer);
        let type_symbol_address = host.getModuleSymbolAddress(this.moduleName, type_symbol, this.context);
        return obType.address === type_symbol_address;
    }

    __cast(pointer, type) {
        return host.createTypedObject(pointer.address, this.moduleName, type, this.context);
    }

    __sizeof(type) {
        let type_ctype = host.getModuleType(this.moduleName, type, this.context);
        return type_ctype.size;
    }

    __readByte(p, isSigned) {
        return host.memory.readMemoryValues(p, 1, 1, isSigned, this.context)[0];
    }

    _PyGILState_GetInterpreterStateUnsafe() {
        let py_runtime = host.getModuleSymbol(this.moduleName, '_PyRuntime', this.context);
        return py_runtime.gilstate.autoInterpreterState;
    }

    PyGILState_GetThisThreadState(teb) {
        const pyRuntime = host.getModuleSymbol(this.moduleName, '_PyRuntime', this.context);
        const tssKey = pyRuntime.gilstate.autoTSSkey;
        if (tssKey._is_initialized.compareTo(0) !== 0) {
            const tstate = utils.TlsGetValue(teb, tssKey._key);
            if (tstate.compareTo(0) !== 0) {
                return host.createTypedObject(
                    tstate.address, this.moduleName, 'PyThreadState', this.context);
            }
        }
        return null;
    }

    Py_TYPE(pointer) {
        // #define Py_TYPE(ob) (((PyObject*)(ob))->ob_type)
        let pointer_as_pyobject = this.__cast(pointer, 'PyObject');
        return pointer_as_pyobject.ob_type;
    }

    Py_SIZE(pointer) {
        // #define Py_SIZE(ob) (((PyVarObject*)(ob))->ob_size)
        let pointer_as_pyobject = this.__cast(pointer, 'PyVarObject');
        return pointer_as_pyobject.ob_size;
    }

    PyFrame_Check(frame) {
        // #define PyFrame_Check(op) (Py_TYPE(op) == &PyFrame_Type)
        return this.__check_PyObject_type(frame, 'PyFrame_Type');
    }

    PyUnicode_Check(op) {
        // #define PyUnicode_Check(op) \
        //                  PyType_FastSubclass(Py_TYPE(op), Py_TPFLAGS_UNICODE_SUBCLASS)
        // #define Py_TPFLAGS_UNICODE_SUBCLASS     (1UL << 28)
        // #define PyType_FastSubclass(t,f)        PyType_HasFeature(t,f)
        // #define PyType_HasFeature(t,f)          (((t)->tp_flags & (f)) != 0)
        const Py_TPFLAGS_UNICODE_SUBCLASS = 1 << 28;

        let tp_flags = this.Py_TYPE(op).tp_flags;
        return tp_flags.bitwiseAnd(Py_TPFLAGS_UNICODE_SUBCLASS).compareTo(0) !== 0;
    }

    PyBytes_Check(op) {
        // #define PyBytes_Check(op) \
        //                  PyType_FastSubclass(Py_TYPE(op), Py_TPFLAGS_BYTES_SUBCLASS)
        // #define Py_TPFLAGS_BYTES_SUBCLASS       (1UL << 27)
        // #define PyType_FastSubclass(t,f)        PyType_HasFeature(t,f)
        // #define PyType_HasFeature(t,f)          (((t)->tp_flags & (f)) != 0)
        const Py_TPFLAGS_BYTES_SUBCLASS = 1 << 27;

        let tp_flags = this.Py_TYPE(op).tp_flags;
        return tp_flags.bitwiseAnd(Py_TPFLAGS_BYTES_SUBCLASS).compareTo(0) !== 0;
    }

    PyFrame_GetLineNumber(f) {
        if (f.f_trace.compareTo(0) !== 0)
            return f.f_lineno;
        else
            return this.PyCode_Addr2Line(f.f_code, f.f_lasti);
    }

    PyCode_Addr2Line(co, addrq) {
        // Py_ssize_t size = PyBytes_Size(co->co_lnotab) / 2;
        // unsigned char *p = (unsigned char*)PyBytes_AsString(co->co_lnotab);
        // int line = co->co_firstlineno;
        // int addr = 0;
        // while (--size >= 0) {
        //     addr += *p++;
        //     if (addr > addrq)
        //         break;
        //     line += (signed char)*p;
        //     p++;
        // }
        // return line;

        let lnotab = co.co_lnotab; // line no. table
        if (!this.PyBytes_Check(lnotab)) return -1;
        let size = Math.floor(this.Py_SIZE(lnotab) / 2);

        // typedef struct {
        //     PyObject_VAR_HEAD
        //     Py_hash_t ob_shash;
        //     char ob_sval[1];
        // } PyBytesObject;

        // we need (char*)(&(lnotab->ob_sval))
        let PyBytesObject = host.getModuleType(this.moduleName, 'PyBytesObject', this.context);
        let p = lnotab.address.add(PyBytesObject.fields.ob_sval.offset);

        let line = co.co_firstlineno;
        let addr = 0;
        while (--size >= 0) {
            addr += this.__readByte(p, false);
            // host.diagnostics.debugLog(`a line=${line}, addr=${addr}, p=${p}\n`);
            p = p.add(1);
            if (addr > addrq) break;
            line += this.__readByte(p, true);
            // host.diagnostics.debugLog(`b line=${line}, addr=${addr}, p=${p}\n`);
            p = p.add(1);
        }
        return line;
    }

    my_FrameFromTstate(tstate) {
        return tstate.frame;
    }

    my_ReadUnicodeText(text) {
        const PyUnicode_WCHAR_KIND = 0;
        const PyUnicode_1BYTE_KIND = 1;
        const PyUnicode_2BYTE_KIND = 2;
        const PyUnicode_4BYTE_KIND = 4;

        let ascii = this.__cast(text, 'PyASCIIObject');
        let size = ascii.length;
        let kind = ascii.state.kind.asNumber();
        if (kind === PyUnicode_WCHAR_KIND) {
            let wstr = ascii.wstr;
            if (wstr.compareTo(0) === 0) return '';
            // size = ((PyCompactUnicodeObject *)text)->wstr_length;
            size = this.__cast(text, 'PyCompactUnicodeObject').wstr_length;
            return host.memory.readWideString(wstr, size, this.context);
        }

        let ptr;
        if (ascii.state.compact) {
            if (ascii.state.ascii) {
                ptr = text.address.add(this.__sizeof('PyASCIIObject'));
            } else {
                ptr = text.address.add(this.__sizeof('PyCompactUnicodeObject'));
            }
        } else {
            ptr = this.__cast(text, 'PyUnicodeObject').data.any;
            if (ptr.compareTo(0) === 0) return '';
        }

        // #define PyUnicode_READ(kind, data, index) \
        //     ((Py_UCS4) \
        //     ((kind) == PyUnicode_1BYTE_KIND ? \
        //         ((const Py_UCS1 *)(data))[(index)] : \
        //         ((kind) == PyUnicode_2BYTE_KIND ? \
        //             ((const Py_UCS2 *)(data))[(index)] : \
        //             ((const Py_UCS4 *)(data))[(index)] \
        //         ) \
        //     ))

        // read char by char
        let charCodes = host.memory.readMemoryValues(ptr, size, kind, false, this.context);
        return String.fromCodePoint(...charCodes);
    }
}

class api310 extends api37 {
    PyFrame_GetLineNumber(f) {
        if (f.f_lineno !== 0)
            return f.f_lineno;
        else
            return this.PyCode_Addr2Line(f.f_code, f.f_lasti * this.__sizeof('_Py_CODEUNIT'));
    }

    PyCode_Addr2Line(co, addrq) {
        if (addrq < 0) {
            return co.co_firstlineno;
        }

        let linetable = co.co_linetable;
        let length = this.Py_SIZE(linetable);

        let PyBytesObject = host.getModuleType(this.moduleName, 'PyBytesObject', this.context);
        let p = linetable.address.add(PyBytesObject.fields.ob_sval.offset);

        let bounds = {
            lo_next: p,
            limit: p.add(length),
            ar_start: -1,
            ar_end: 0,
            computed_line: co.co_firstlineno,
            ar_line: -1,

            toString: function () {
                return `lo_next=0x${this.lo_next.toString(16)}, ` +
                    `limit=0x${this.limit.toString(16)}, ` +
                    `ar_start=${this.ar_start}, ` +
                    `ar_end=${this.ar_end}, ` +
                    `computed_line=${this.computed_line}, ` +
                    `ar_line=${this.ar_line}`;
            }
        };

        // _PyCode_CheckLineNumber(addrq, bounds)
        while (bounds.ar_end <= addrq) {
            if (!this._PyLineTable_NextAddressRange(bounds)) {
                return -1;
            }
        }
        while (bounds.ar_start > addrq) {
            if (!this._PyLineTable_PreviousAddressRange(bounds)) {
                return -1;
            }
        }
        return bounds.ar_line;
    }

    _PyLineTable_PreviousAddressRange(range) {
        let api = this;

        function retreat(bounds) {
            let ldelta = api.__readByte(bounds.lo_next.add(-1), true);
            if (ldelta === -128) {
                ldelta = 0;
            }
            bounds.computed_line -= ldelta;
            bounds.lo_next = bounds.lo_next.add(-2);
            bounds.ar_end = bounds.ar_start;
            bounds.ar_start -= api.__readByte(bounds.lo_next.add(-2), false);
            ldelta = api.__readByte(bounds.lo_next.add(-1), true);
            if (ldelta === -128) {
                bounds.ar_line = -1;
            } else {
                bounds.ar_line = bounds.computed_line;
            }
        }

        if (range.ar_start <= 0) {
            return 0;
        }
        retreat(range);
        while (range.ar_start === range.ar_end) {
            // assert(range->ar_start > 0);
            retreat(range);
        }
        return 1;
    }

    _PyLineTable_NextAddressRange(range) {
        let api = this;

        function advance(bounds) {
            bounds.ar_start = bounds.ar_end;
            let delta = api.__readByte(bounds.lo_next, false);
            bounds.ar_end += delta;
            let ldelta = api.__readByte(bounds.lo_next.add(1), true);
            bounds.lo_next = bounds.lo_next.add(2);
            if (ldelta === -128) {
                bounds.ar_line = -1;
            } else {
                bounds.computed_line += ldelta;
                bounds.ar_line = bounds.computed_line;
            }
        }

        if (range.lo_next.compareTo(range.limit) >= 0) {
            return 0;
        }
        advance(range);
        while (range.ar_start === range.ar_end) {
            // assert(!at_end(range));
            advance(range);
        }
        return 1;
    }

}

class api311 extends api310 {
    // should be _PyInterpreterFrame_GetLine(PyFrameObject *f)
    PyFrame_GetLineNumber(f) {
        //#define _PyInterpreterFrame_LASTI(IF) \
        //     ((int)((IF)->prev_instr - _PyCode_CODE((IF)->f_code)))
        // TODO is this correct?
        // let addr = f.prev_instr.address.subtract(f.f_code.co_code_adaptive.address);

        let PyCodeObject = host.getModuleType(this.moduleName, 'PyCodeObject', this.context);
        // let p = lnotab.address.add(PyCodeObject.fields.co_code_adaptive.offset);
        let addr = f.prev_instr.address
            .subtract(f.f_code.address)
            .subtract(PyCodeObject.fields.co_code_adaptive.offset);
        host.diagnostics.debugLog(`prev_instr=${f.prev_instr.address.toString(16)}\n`);
        host.diagnostics.debugLog(`f_code=${f.f_code.address.toString(16)}\n`);
        host.diagnostics.debugLog(`ofs=${PyCodeObject.fields.co_code_adaptive.offset.toString(16)}\n`);
        host.diagnostics.debugLog(`addr=${addr}\n`);
        // let addr = _PyInterpreterFrame_LASTI(f) * this.__sizeof('_Py_CODEUNIT');
        return this.PyCode_Addr2Line(f.f_code, addr);
    }

    _PyLineTable_PreviousAddressRange(range) {
        let api = this;

        function retreat(bounds) {
            let ldelta = api.__readByte(bounds.lo_next.add(-1), true);
            if (ldelta === -128) {
                ldelta = 0;
            }
            bounds.computed_line -= ldelta;
            bounds.lo_next = bounds.lo_next.add(-2);
            bounds.ar_end = bounds.ar_start;
            bounds.ar_start -= api.__readByte(bounds.lo_next.add(-2), false);
            ldelta = api.__readByte(bounds.lo_next.add(-1), true);
            if (ldelta === -128) {
                bounds.ar_line = -1;
            } else {
                bounds.ar_line = bounds.computed_line;
            }
        }

        if (range.ar_start <= 0) {
            return 0;
        }
        retreat(range);
        // assert(range->ar_end > range->ar_start);
        return 1;
    }

    _PyLineTable_NextAddressRange(range) {
        host.diagnostics.debugLog(`next ${range}\n`);
        let api = this;

        function advance(bounds) {
            bounds.ar_start = bounds.ar_end;
            let delta = api.__readByte(bounds.lo_next, false);
            bounds.ar_end += delta;
            let ldelta = api.__readByte(bounds.lo_next.add(1), true);
            bounds.lo_next = bounds.lo_next.add(2);
            if (ldelta === -128) {
                bounds.ar_line = -1;
            } else {
                bounds.computed_line += ldelta;
                bounds.ar_line = bounds.computed_line;
            }
        }

        if (range.lo_next.compareTo(range.limit) >= 0) {
            return 0;
        }
        advance(range);
        host.diagnostics.debugLog(`---- ${range}\n`);
        // assert(range->ar_end > range->ar_start);
        return 1;
    }

    my_FrameFromTstate(tstate) {
        return tstate.cframe.current_frame;
    }
}

let apiMap = {
    37: function (thread, moduleName) {
        return new api37(moduleName, thread.hostContext);
    },
    38: function (thread, moduleName) {
        return new api37(moduleName, thread.hostContext);
    },
    39: function (thread, moduleName) {
        return new api37(moduleName, thread.hostContext);
    },
    310: function (thread, moduleName) {
        return new api310(moduleName, thread.hostContext);
    },
    // LineNumber not correct! (currently working...)
    311: function (thread, moduleName) {
        return new api311(moduleName, thread.hostContext);
    },
};

export default apiMap;
