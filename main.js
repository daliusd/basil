var button = document.querySelector('#button');

if (window.Worker) {
    var worker = new Worker("worker.js");

    button.onclick = function() {
      worker.postMessage('test');
      console.log('Message posted to worker');
    }

    worker.onmessage = function(e) {
        const blobURL = e.data;

        const tempLink = document.createElement('a');
        tempLink.style.display = 'none';
        tempLink.href = blobURL;
        tempLink.setAttribute('download', 'test.pdf');
        if (typeof tempLink.download === 'undefined') {
            tempLink.setAttribute('target', '_blank');
        }
        document.body.appendChild(tempLink);
        tempLink.click();
        document.body.removeChild(tempLink);
        setTimeout(() => {
            // For Firefox it is necessary to delay revoking the ObjectURL
            window.URL.revokeObjectURL(blobURL);
        }, 100);
    }
}
