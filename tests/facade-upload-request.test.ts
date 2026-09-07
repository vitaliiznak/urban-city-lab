import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, mkdir, copyFile, rm, readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {Readable} from "node:stream";
import {facadeToolPlugin} from "../server/facade-plugin";

test("upload uses the selected elevation for both vision dimensions and returned placement", async () => {
  const projectRoot=await mkdtemp(join(tmpdir(),"facade-request-test-"));
  const previous=process.env.FACADE_LLM;
  process.env.FACADE_LLM="fixture";
  try {
    await mkdir(join(projectRoot,"src/facade-tool"),{recursive:true});
    await copyFile("src/facade-tool/facade-description.schema.json",join(projectRoot,"src/facade-tool/facade-description.schema.json"));
    let handler:any;
    const plugin=facadeToolPlugin({projectRoot,explorerRoot:resolve("../adliswil-explorer/outputs/adliswil")});
    (plugin.configureServer as Function)({middlewares:{use:(fn:any)=>{handler=fn;}}});
    const image=await readFile("public/reference/poststrasse-9/source.png");
    const heading=Math.PI/2+0.003937;
    const request=Object.assign(Readable.from([JSON.stringify({address:"Poststrasse 9",heading,image:`data:image/png;base64,${image.toString("base64")}`})]),{url:"/api/facade/from-photo",method:"POST"});
    let raw="";
    const response={statusCode:0,setHeader(){},end(text:string){raw=text;}};
    await handler(request,response,()=>assert.fail("unhandled upload"));
    assert.equal(response.statusCode,200);
    const job=JSON.parse(raw);
    assert.equal(job.address.heading,heading);
    assert.ok(job.wallHint.widthMetres>14&&job.wallHint.widthMetres<15,"front elevation, not the 28 m side");
    assert.ok(job.wallHint.heightMetres>17&&job.wallHint.heightMetres<19,"visible elevation excludes buried walls");
    const prompt=await readFile(join(projectRoot,"output/facades",`${job.building.id}.prompt.txt`),"utf8");
    assert.ok(prompt.includes(`${job.wallHint.widthMetres} m wide`));
    assert.ok(prompt.includes(`${job.wallHint.heightMetres} m tall`));
  } finally {
    if(previous==null) delete process.env.FACADE_LLM; else process.env.FACADE_LLM=previous;
    await rm(projectRoot,{recursive:true,force:true});
  }
});
