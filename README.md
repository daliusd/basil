Basil
=====

PDF Generator for Cardamon/Saffron.

Test worker standalone:
```
npm start -- --sample 04 && xdg-open output.pdf
```

If you want to do development change directory to "app" before running editor
because "app" and "worker" builds use different `tsconfig.json` files.

Build final worker:
```
npm run build
```
