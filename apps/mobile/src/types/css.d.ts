// A versão web importa CSS (global e módulos); o Metro cuida disso, aqui só informamos ao TypeScript.
declare module '*.css';
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
