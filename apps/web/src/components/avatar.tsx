/**
 * Foto de perfil: a ilustração da carta escolhida, recortada em círculo (a caixa de arte fica centralizada).
 * Sem carta escolhida mostra a inicial do nome. `url` é a imagem pequena da carta (`avatarUrl` da API).
 */
export function Avatar({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };
  if (!url) {
    return (
      <span className="avatar avatar-initial" style={style} aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return <span className="avatar" style={{ ...style, backgroundImage: `url("${url}")` }} role="img" aria-label={`Foto de perfil de ${name}`} />;
}