import type { ReactNode } from 'react'

export function Icon({ children }: { children: ReactNode }) { return <span className="icon" aria-hidden="true">{children}</span> }
export function Button({children, variant='primary', onClick}:{children:ReactNode;variant?:'primary'|'ghost';onClick?:()=>void}) { return <button type="button" className={`button ${variant}`} onClick={onClick}>{children}</button> }
export function Badge({children, tone='muted'}:{children:ReactNode;tone?:string}) { return <span className={`badge ${tone}`}>{children}</span> }
