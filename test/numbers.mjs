#!/usr/bin/env node
// Isolated numeric-library machine-code oracle; JavaScript only builds the image.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {assemble} from '../tools/assembler.mjs';
import {elf64} from '../tools/image.mjs';
const bits=n=>{const b=Buffer.alloc(8);b.writeDoubleLE(n);return b.readBigUInt64LE().toString(16).padStart(16,'0');};
const fromBits=hex=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt('0x'+hex));return b.readDoubleLE();};
const cases=[];
const parse=(s,mode=0)=>cases.push({kind:mode,source:s,expected:mode?Number(s):parseFloat(s)});
const format=n=>cases.push({kind:2,value:n,expected:n});
const mod=(a,b)=>cases.push({kind:3,value:a,rhs:b,expected:a%b});
const pow=(a,b)=>cases.push({kind:4,value:a,rhs:b,expected:a**b});
for(const s of ['0','-0','1','100','1e2','.1','1.5','0.1','9007199254740993','9007199254740995','1.7976931348623157e308','1.7976931348623158e308','1.7976931348623159e308','2.2250738585072014e-308','2.2250738585072012e-308','5e-324','2.4703282292062327e-324','2.4703282292062328e-324','1e-325','-1e-400','Infinity','-Infinity','  +1.25e+2foo','  ','1e','1e+','.','+.','NaN','0xff','0b101','0o777','0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF','1e999999999999','-1e999999999999','1e-999999999999','\u2000-2\u3000','\ufeff0x10','-0x10','+0x10','Infinityx','1\u0000','100000000000000000000000000000000000000000000000000000000000001']){parse(s);parse(s,1);}
for(const n of [0,-0,1,-1,0.1,0.3,1.2345678901234567,Number.MIN_VALUE,Number.MAX_VALUE,Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,1e21,1e20,1e-6,1e-7,1.0000000000000002,1.0000000000000001e18,NaN,Infinity,-Infinity,2.2250738585072014e-308,2.225073858507201e-308])format(n);
// Exact halfway decimals, including values with decisive digits beyond digit 1,150.
function dyadicDecimal(coefficient, exponent) {
 let n=coefficient, scale=0;
 if(exponent<0){scale=-exponent;n*=5n**BigInt(scale);}else n<<=BigInt(exponent);
 let digits=String(n);
 if(!scale)return digits;
 digits=digits.padStart(scale+1,'0');
 return digits.slice(0,-scale)+'.'+digits.slice(-scale);
}
for(const [coefficient, exponent] of [[1n,-1075],[(1n<<53n)+1n,-53],[(1n<<53n)+3n,-53],[(1n<<53n)-1n,-1075],[(1n<<54n)-1n,970]]){
 const midpoint=dyadicDecimal(coefficient,exponent);parse(midpoint);parse('-'+midpoint);
 const [whole,fraction='']=midpoint.split('.');const tail=fraction.padEnd(1500,'0');
 const decimal=BigInt(whole+tail);
 for(const delta of [-1n,1n]){const digits=String(decimal+delta).padStart(1501,'0');parse(digits.slice(0,-1500)+'.'+digits.slice(-1500));}
}
let seed=123456789n; const rand=()=>{seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);const b=Buffer.alloc(8);b.writeBigUInt64LE(seed);return b.readDoubleLE();};
for(let i=0;i<Number(process.env.NUMBER_RANDOM||100);i++){const n=rand();format(n);parse(String(n));}
for(const [a,b] of [[5,2],[-5,2],[5,-2],[-0,2],[0,0],[Infinity,1],[1,Infinity],[1,NaN],[Number.MAX_VALUE,3],[Number.MIN_VALUE,1e-323],[2.2250738585072014e-308,1e-320]])mod(a,b);
if(process.env.NUMBER_POW)for(const [a,b]of [[2,3],[2,-3],[2,.5],[9,.5],[-2,3],[-2,2],[-2,.5],[0,0],[-0,-3],[-0,3],[Infinity,0],[-Infinity,3],[-1,Infinity],[NaN,0],[1,NaN],[1.0000000000000002,4503599627370496],[1.1,1000],[.5,1074],[2,1024],[10,-308],[10,-323]])pow(a,b);
if(process.env.NUMBER_POW){for(let i=0;i<500;i++){const a=Math.abs(rand());const b=rand();pow(a,b);if(i<100){pow(Math.abs(Math.sin(i)+1.01),Math.cos(i)*1000);pow(2,(i-50)*.31);}}}
if(process.env.NUMBER_POW){for(let i=0;i<1000;i++){pow(Math.exp(Math.sin(i)*10),Math.cos(i)*100);if(i<50)pow(-1.00001,i-25);}}
// These three independently checked 150-digit Decimal oracles round one ULP
// above Node's Math.pow, so assert the native result rather than copying Node.
if(process.env.NUMBER_POW)for(const [a,b,hex]of [[22007.148221379262,1.324660552058789,'412141dec3b571f7'],[1438.30132462213,-68.65084698355503,'12ecafbfffd43141'],[27.08701791827744,-94.4013977372425,'23d9e13184263acb']])cases.push({kind:4,value:a,rhs:b,expected:fromBits(hex),exact:true});
let data='\n.align 3\nnum_test_cases:\n';
cases.forEach((c,i)=>data+=` .quad ${c.kind}, ${c.kind<2?'num_test_s'+i:'0x'+bits(c.value)}, ${c.kind<2?0:'0x'+bits(c.rhs ?? 0)}\n`);
cases.forEach((c,i)=>{if(c.kind<2){const b=Buffer.from(c.source,'utf16le');data+=`.align 3\nnum_test_s${i}:\n .quad 1, ${c.source.length}\n .byte ${[...b,0,0].join(',')}\n`;}});
const platform=`
_start:
 mov x0, #0x40c00000
 mov sp, x0
 mrs x0, cpacr_el1
 orr x0, x0, #0x300000
 msr cpacr_el1, x0
 isb
 mov x24, #0x48000000
 adr x19, num_test_cases
 mov x20, #${cases.length}
num_test_loop:
 ldr x21, [x19]
 ldr x0, [x19, #8]
 cmp x21, #2
 b.hs num_test_value
 mov x1, x21
 bl number_parse
 b num_test_report
num_test_value:
 fmov d0, x0
 ldr x0, [x19, #16]
 fmov d1, x0
 cmp x21, #3
 b.eq num_test_mod
 cmp x21, #4
 b.eq num_test_pow
 b num_test_report
num_test_mod:
 bl number_mod
 b num_test_report
num_test_pow:
 ${process.env.NUMBER_POW?'bl number_pow':'nop'}
num_test_report:
 bl num_test_print
 add x19, x19, #24
 sub x20, x20, #1
 cbnz x20, num_test_loop
 adr x0, num_test_done
 bl num_test_puts
num_test_halt:
 wfi
 b num_test_halt
num_test_print:
 stp x19, x30, [sp, #-16]!
 stp x20, x21, [sp, #-16]!
 fmov x19, d0
 mov x20, #60
num_test_hex_loop:
 lsr x0, x19, x20
 and x0, x0, #15
 add x0, x0, #48
 cmp x0, #57
 b.ls num_test_hex_char
 add x0, x0, #39
num_test_hex_char:
 bl num_test_putc
 subs x20, x20, #4
 b.ge num_test_hex_loop
 mov x0, #32
 bl num_test_putc
 fmov d0, x19
 bl number_format
 add x19, x0, #16
 ldr x20, [x0, #8]
num_test_str_loop:
 cbz x20, num_test_str_done
 ldrh w0, [x19], #2
 bl num_test_putc
 sub x20, x20, #1
 b num_test_str_loop
num_test_str_done:
 mov x0, #10
 bl num_test_putc
 ldp x20, x21, [sp], #16
 ldp x19, x30, [sp], #16
 ret
num_test_putc:
 mov x1, #0x09000000
num_test_uart:
 ldr w2, [x1, #24]
 tbnz w2, #5, num_test_uart
 str w0, [x1]
 ret
num_test_puts:
 stp x19, x30, [sp, #-16]!
 mov x19, x0
num_test_puts_loop:
 ldrb w0, [x19], #1
 cbz x0, num_test_puts_done
 bl num_test_putc
 b num_test_puts_loop
num_test_puts_done:
 ldp x19, x30, [sp], #16
 ret
string_new:
 mov x2, x24
 mov x3, #1
 str x3, [x2]
 str x1, [x2, #8]
 add x4, x2, #16
 mov x5, #0
num_test_new_loop:
 cmp x5, x1
 b.hs num_test_new_end
 ldrh w6, [x0, x5, lsl #1]
 strh w6, [x4, x5, lsl #1]
 add x5, x5, #1
 b num_test_new_loop
num_test_new_end:
 strh wzr, [x4, x5, lsl #1]
 add x24, x4, x5, lsl #1
 add x24, x24, #9
 and x24, x24, #0xfffffffffffffff8
 mov x0, x2
 ret
string_from_utf8:
 mov x2, x24
 mov x3, #1
 str x3, [x2]
 str x1, [x2, #8]
 add x4, x2, #16
 mov x5, #0
num_test_utf_loop:
 cmp x5, x1
 b.hs num_test_new_end
 ldrb w6, [x0, x5]
 strh w6, [x4, x5, lsl #1]
 add x5, x5, #1
 b num_test_utf_loop
runtime_error:
 bl num_test_puts
 b num_test_halt
num_test_done:
 .asciz "DONE\\n"
.align 2
`;
const source=platform+fs.readFileSync(new URL('../runtime/full/numbers.s',import.meta.url),'utf8')+data;
const base=0x40200000;const {buffer,symbols}=assemble(source,{base});
fs.mkdirSync('/private/tmp/turtles-numbers',{recursive:true});
fs.writeFileSync('/private/tmp/turtles-numbers/numbers.elf',elf64(buffer,base,symbols.get('_start')));
fs.writeFileSync('/private/tmp/turtles-numbers/numbers.s',source);
const child=spawn(process.env.QEMU_BINARY||process.env.QEMU||'qemu-system-aarch64',['-machine','virt-8.2','-cpu','cortex-a53','-m','512M','-display','none','-monitor','none','-serial','stdio','-device','loader,file=/private/tmp/turtles-numbers/numbers.elf,cpu-num=0']);
let output='';let stderr='';const timeout=setTimeout(()=>{child.kill();console.error('Timeout',output.slice(-1000),stderr);process.exitCode=1;},60000);
child.stdout.on('data',b=>{output+=b;if(output.includes('DONE\n'))child.kill();});child.stderr.on('data',b=>stderr+=b);
await new Promise(resolve=>child.on('exit',resolve));clearTimeout(timeout);
if(!output.includes('DONE\n'))throw Error('Numeric guest did not finish: '+output.slice(-1000)+' '+stderr);
const lines=output.trim().split('\n').filter(x=>x!=='DONE');let failed=0,powDifferences=0;
for(let i=0;i<cases.length;i++){
 const c=cases[i],line=lines[i]||'',split=line.indexOf(' '),actualBits=line.slice(0,split),actualText=line.slice(split+1);
 const actualValue=/^[0-9a-f]{16}$/.test(actualBits)?fromBits(actualBits):NaN;
 const exact=Number.isNaN(c.expected)?Number.isNaN(actualValue):actualBits===bits(c.expected);
 const distance=/^[0-9a-f]{16}$/.test(actualBits)?BigInt('0x'+actualBits)-BigInt('0x'+bits(c.expected)):999n;
 const allowedPow=!c.exact&&c.kind===4&&Number.isFinite(c.expected)&&Number.isFinite(actualValue)&&distance>=-1n&&distance<=1n;
 if(!exact&&allowedPow)powDifferences++;
 if((!exact&&!allowedPow)||actualText!==String(actualValue)){failed++;console.error(JSON.stringify({i,case:c,actual:line,expected:`${bits(c.expected)} ${String(c.expected)}`}));}
}
console.log(`${cases.length-failed}/${cases.length} numeric cases passed (${powDifferences} pow results differ from Node by one ULP)`);if(failed)process.exitCode=1;
