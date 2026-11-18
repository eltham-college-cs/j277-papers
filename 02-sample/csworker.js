// Web worker: compiles and runs C# in the browser using WasmSharp (Roslyn + .NET on WebAssembly).
import { initializeWasmSharpModule } from "./vendor/wasmsharp/initializeWasmSharpModule.js";
let interop = null;
const ready = initializeWasmSharpModule({}, {
  onDownloadResourceProgress: (loaded, total) => postMessage({ type: "progress", loaded, total }),
}).then((i) => { interop = i; postMessage({ type: "ready" }); })
  .catch((e) => { postMessage({ type: "initerror", message: String(e && e.message || e) }); });

onmessage = async (e) => {
  await ready;
  const { id, code } = e.data;
  if (!interop) { postMessage({ type: "result", id, error: "C# runtime failed to load" }); return; }
  try {
    const cid = interop.CreateNewCompilation(code);
    const res = JSON.parse(await interop.RunAsync(cid));
    postMessage({ type: "result", id, res });
  } catch (err) {
    postMessage({ type: "result", id, error: String(err && err.message || err) });
  }
};
