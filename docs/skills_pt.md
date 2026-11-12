# Importar e gerenciar habilidades

[简体中文](./skills.md) | [English](./skills_en.md) | [日本語](./skills_ja.md) | [한국어](./skills_ko.md) | [Русский](./skills_ru.md) | [Español](./skills_es.md) | Português (Brasil)

A partir do AnyModelBot 0.1.24, você pode adicionar a um bot fluxos de trabalho que já tem, na forma de pacotes de habilidades em ZIP, para tarefas como relatórios semanais, processamento de documentos e pesquisa.

## Importar

1. Abra as configurações do bot de destino, encontre Habilidades e clique em Importar ZIP.
2. Selecione um ZIP local e revise o nome, a descrição e o número de arquivos. Expanda as instruções para lê-las por inteiro.
3. Clique em Adicionar habilidade. O bot pode carregá-la quando uma tarefa relacionada precisar dela.

Cada ZIP contém uma habilidade. O `SKILL.md` pode ficar na raiz do ZIP ou dentro de uma pasta que envolva o conteúdo. Arquivos de apoio, como `scripts/`, `references/` e `assets/`, são preservados. A importação não acessa o GitHub nem executa scripts de instalação automaticamente.

O `SKILL.md` precisa de um frontmatter YAML e de um corpo com as instruções, por exemplo:

```markdown
---
name: weekly-report
description: Escrever relatórios semanais a partir das anotações de trabalho do usuário.
---

Organize o trabalho concluído, os problemas e os planos para a próxima semana e, depois, use o formato pedido pelo usuário.
```

Os nomes usam letras minúsculas do alfabeto inglês, dígitos e hifens simples, com até 64 caracteres. Os arquivos ZIP podem ter até 20 MB, com até 64 MB e 2.000 entradas depois de extraídos. O `SKILL.md` pode ter até 256 KB, e cada bot pode ter até 100 habilidades importadas. Se um ZIP contiver vários arquivos `SKILL.md`, empacote cada habilidade separadamente.

## Usar, substituir e excluir

- Uma habilidade vale apenas para o bot ao qual você a adicionou. Esse bot usa as mesmas habilidades no app e nos canais de chat.
- Na lista, veja as instruções, ative, desative ou exclua habilidades. As alterações esperam até o bot ficar ocioso.
- Importe de novo uma habilidade com o mesmo nome, revise-a e clique em Substituir habilidade. A substituição preserva o estado ativado ou desativado.
- Excluir uma habilidade remove os arquivos dela e mantém o que já foi gerado no espaço de trabalho.
- Nomes integrados, como `media`, `computer-use` e `amb-app`, e as habilidades fornecidas pelos bots do catálogo não podem ser sobrescritos por pacotes importados.

As habilidades rodam com as permissões que o bot já tem. Uma habilidade que precisa de Python, de outro software ou da conexão de uma conta exige esse ambiente. Habilidades que dependem de ferramentas específicas de outro cliente podem precisar de ajustes. Ter um formato compatível não significa que todas as ferramentas de apoio estejam instaladas.

## Armazenamento

Os pacotes extraídos ficam em `skills/<ID do bot>/`, na pasta de dados. As habilidades ativadas são copiadas para `dsh/<ID do bot>/skills/` para o runtime. A importação só envia arquivos para a instância do AnyModelBot que você está usando; em uma implantação em servidor, os arquivos ficam armazenados nesse servidor. Os nomes e as descrições das habilidades ativadas, assim como as instruções ou referências carregadas durante o uso, passam a ser contexto enviado ao modelo selecionado. Veja [Dados e privacidade](./privacy_pt.md).
