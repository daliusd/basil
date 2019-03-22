Basil
=====

PDF Generator for Cardamon/Saffron.

Test worker standalone:
```
npm start -- --username dalius --password P && xdg-open output.pdf
```

If you want to do development change directory to "app" before running editor
because "app" and "worker" builds use different `tsconfig.json` files.

Build final worker:
```
npm run build
```
