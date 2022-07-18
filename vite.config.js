export default {
    build: {
        lib: {
            entry: 'src/index.js',
            name: 'Doxor',
            fileName: 'doxor',
            formats:['es']
        },
        outDir:'dist',
        rollupOptions: {
            input: {
                main: 'src/index.js',
            }
        },
        minify:'esbuild',
        keepNames:true
    }
}