# WinDbg CPython Tools

WinDbg scripts for debugging CPython. Live and crash dump.

Supported CPython releases: 3.7~3.11, x86/AMD64  
(3.11 has minor issues currently, ARM/ARM64 might work, but untested)

## Information

`pystk.js`: Extract human-readable python stacktrace.

## Build

(Or if you don't have `Node.js`, download the artifacts from CI)

1. Install `Node.js`
2. Install npm packages with `npm ci`
3. `npm run build`
4. Find outputs in `build` directory

## Use

Install latest WinDbg Preview from Microsoft Store: https://www.microsoft.com/store/productId/9PGJGD53TN86

Start a live debugging session, or load a crash-dump with full memory information.

Load the script

```
.scriptload "C:\...\pystk.js"
```

Then try any of these:

```
!pystk
dx -r2 @$pystk()
dx -r2 @$curprocess.Threads
```

(observe `PythonState` in Stack object.)

And filter / simplify result with LINQ

```
dx -r2 @$curprocess.Threads.Select(thd=>thd.PythonState).Where(ps=>ps.IsPythonThread)
```
