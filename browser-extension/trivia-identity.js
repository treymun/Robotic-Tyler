// Compatibility names for older arcade/music callers; the reader is shared.
(()=>{
 globalThis.TylerTriviaIdentity={
  identify:(node,region)=>globalThis.TylerIdentity?.identify(node,region)||null,
  identifyAccount:(node,region)=>globalThis.TylerIdentity?.speaker(node,region)||null
 };
})();
