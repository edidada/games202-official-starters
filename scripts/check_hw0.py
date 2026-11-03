"""Real Chromium WebGL acceptance, executed only by GitHub Actions."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import io
import json
from pathlib import Path
import threading

from PIL import Image
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
output = root/'output/playwright'
output.mkdir(parents=True, exist_ok=True)
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(root/'hw0')))
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 800, 'height': 600}, device_scale_factor=1)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' and 'favicon' not in message.text else None)
        page.goto(f'http://127.0.0.1:{server.server_port}/', wait_until='networkidle')
        page.wait_for_function('window.labLoadError || (window.labScene && labScene.renderer.meshes.length >= 2)', timeout=60000)
        assert page.evaluate('window.labLoadError || null') is None, page.evaluate('window.labLoadError')
        page.wait_for_timeout(1500)
        gl_error = page.evaluate('labScene.gl.getError()')
        assert gl_error == 0, f'WebGL error {gl_error}'
        # Read actual framebuffer: DOM GUI pixels cannot satisfy this check.
        frame = page.evaluate("""() => {
          const gl=labScene.gl, pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
          gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
          return {width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,pixels:Array.from(pixels)};
        }""")
        image = Image.frombytes('RGBA', (frame['width'], frame['height']), bytes(frame['pixels'])).transpose(Image.Transpose.FLIP_TOP_BOTTOM).convert('RGB')
        image.save(output/'mary-blinn-phong.png')
        lit = sum(max(pixel)-min(pixel) > 15 and max(pixel) > 35 for pixel in image.getdata())
        assert lit > 5000, f'Model did not visibly render: {lit} colored pixels'
        result = page.evaluate('''() => {
          const canvas = document.createElement('canvas'); canvas.width=64;canvas.height=64;
          const gl=canvas.getContext('webgl');
          const material=new PhongMaterial([0.25,0.25,0.25],null,[0.1,0.1,0.1],2);
          material.setMeshAttribs(['aVertexPosition','aNormalPosition','aTextureCoord']);
          const shader=material.compile(gl), program=shader.program;
          gl.useProgram(program.glShaderProgram);
          const positions=new Float32Array([-1,-1,0, 3,-1,0, -1,3,0]);
          function attrib(name,values,size) {
            const location=program.attribs[name]; if(location<0)return;
            const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
            gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);
            gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(location);
          }
          attrib('aVertexPosition',positions,3);
          attrib('aTextureCoord',[0,0, 1,0, 0,1],2);
          const identity=new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
          for(const name of ['uModelMatrix','uModelViewMatrix','uProjectionMatrix'])
            gl.uniformMatrix4fv(program.uniforms[name],false,identity);
          gl.uniformMatrix3fv(program.uniforms.uNormalMatrix,false,new Float32Array([1,0,0,0,1,0,0,0,1]));
          gl.uniform3fv(program.uniforms.uKd,[.25,.25,.25]);
          gl.uniform3fv(program.uniforms.uKs,[.1,.1,.1]);
          gl.uniform3fv(program.uniforms.uCameraPos,[0,0,2]);
          gl.uniform1i(program.uniforms.uTextureSample,0);
          gl.uniform1f(program.uniforms.uLightIntensity,2);
          const cases=[];
          for(const [distance,normal] of [[2,1],[4,1],[2,-1]]) {
            attrib('aNormalPosition',[0,0,normal, 0,0,normal, 0,0,normal],3);
            gl.uniform3fv(program.uniforms.uLightPos,[0,0,distance]);
            gl.drawArrays(gl.TRIANGLES,0,3);
            const pixel=new Uint8Array(4);gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
            cases.push({distance,normal,pixel:Array.from(pixel)});
          }
          return {cases,error:gl.getError(),meshes:labScene.renderer.meshes.length};
        }''')
        assert result['error'] == 0, result
        for case in result['cases']:
            linear = 0.05*0.25
            if case['normal'] > 0:
                linear += 2/(case['distance']**2)*(0.25+0.1)
            expected = round(linear**(1/2.2)*255)
            assert all(abs(channel-expected) <= 3 for channel in case['pixel'][:3]), (case, expected)
        assert not errors, errors
        result.update(colored_pixels=lit, browser=browser.version, errors=errors)
        (output/'metrics.json').write_text(json.dumps(result, indent=2)+'\n')
        print(json.dumps(result))
        browser.close()
finally:
    server.shutdown()
