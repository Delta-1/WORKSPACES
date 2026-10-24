function crc32(bytes){let crc=0;for(const byte of bytes){crc^=byte<<24;for(let bit=0;bit<8;bit++)crc=(crc&0x80000000)?((crc<<1)^0x04c11db7):(crc<<1);}return crc>>>0;}
export function inspectOpusOgg(audio){
 if(!Buffer.isBuffer(audio))throw Error('Invalid audio bytes');
 let pos=0,sequence=0,serial,head=null,eos=false,lastGranule=0n;
 while(pos<audio.length){
  if(pos+27>audio.length||audio.toString('ascii',pos,pos+4)!=='OggS'||audio[pos+4]!==0)throw Error('Invalid Ogg page');
  const segments=audio[pos+26],headerEnd=pos+27+segments;if(headerEnd>audio.length)throw Error('Truncated Ogg segments');
  let bodySize=0;for(let i=pos+27;i<headerEnd;i++)bodySize+=audio[i];
  const end=headerEnd+bodySize;if(end>audio.length)throw Error('Truncated Ogg payload');
  const page=Buffer.from(audio.subarray(pos,end)),expected=page.readUInt32LE(22);page.writeUInt32LE(0,22);if(crc32(page)!==expected)throw Error('Ogg checksum mismatch');
  const pageSerial=audio.readUInt32LE(pos+14);if(serial===undefined)serial=pageSerial;if(pageSerial!==serial||audio.readUInt32LE(pos+18)!==sequence++)throw Error('Invalid Ogg stream sequence');
  if(pos===0){if(!(audio[pos+5]&2))throw Error('Missing Ogg beginning');head=audio.subarray(headerEnd,end);if(head.toString('ascii',0,8)!=='OpusHead'||head.length<19||head[8]!==1||head[9]!==1||head[18]!==0)throw Error('Expected mono Opus audio');}
  lastGranule=audio.readBigUInt64LE(pos+6);eos=!!(audio[pos+5]&4);if(eos&&end!==audio.length)throw Error('Unexpected chained Ogg stream');pos=end;
 }
 if(!head||!eos||lastGranule<=BigInt(head.readUInt16LE(10)))throw Error('Incomplete Opus recording');
 return {channels:1,sampleRate:48000,duration:Number(lastGranule-BigInt(head.readUInt16LE(10)))/48000};
}
