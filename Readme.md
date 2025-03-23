## Referência
Este trabalho foi desenvolvido a partir da base de código e dos shaders vertex e fragment encontrados em [WebGL Load OBJ with MTL](https://webgl2fundamentals.org/webgl/lessons/webgl-load-obj-w-mtl.html).

# Editor de Cena com WebGL

Este projeto é um editor de cena desenvolvido usando WebGL, permitindo a importação, manipulação e visualização de modelos 3D no formato `.obj`. Ele oferece funcionalidades como carregamento de múltiplos objetos, manipulação de posição, rotação e escala.

## Funcionalidades

-   **Carregamento de Múltiplos Objetos**: Importação e visualização de diversos modelos 3D no formato `.obj`.
-   **Manipulação de Objetos**: Controle interativo da posição, rotação e escala dos objetos através de sliders.
-   **Seleção de Objetos**: Seleção de objetos através de um dropdown para manipulação individual.
-   **Remoção de Objetos**: Remoção de objetos da cena.
-   **Salvar/Carregar Estado da Cena**: Salvar e carregar o estado dos objetos na cena em um arquivo JSON.

## Teste Online

Para testar o visualizador online, acesse o [Deployment](https://fpetiz.github.io/Trabalho-1_CG/).

## Teste localmente

1.  **Clonar o Repositório**:
    ```bash
    git clone https://github.com/FPetiz/Trabalho-1_CG
    ```
2.  **Abrir o `index.html`**: Abra o arquivo `index.html` em um navegador web.
3.  **Adicionar Objetos**: Clique nos objetos exibidos no menu 3D para adicioná-los à cena.
4.  **Selecionar Objetos**: Use o dropdown "item-list" para selecionar um objeto na cena.
5.  **Manipular Objetos**: Use os sliders para ajustar a posição, rotação e escala do objeto selecionado.
6.  **Remover Objetos**: Clique no botão "Remove Object" para remover o objeto selecionado.
7.  **Salvar/Carregar Estado**: Use os botões "Save Scene State" e "Load Scene State" para salvar e carregar o estado da cena.

## Arquivos de Modelo

Os arquivos de modelo `.obj` e `.mtl` estão localizados no diretório `obj/`. Já as texturas estão no diretório `mtl/`.

## Shaders

-   `vs`: Vertex shader que transforma as coordenadas dos vértices.
-   `fs`: Fragment shader que calcula as cores dos pixels.

## Controles

-   **Sliders**: Ajustam a posição (X, Y, Z), rotação (X, Y, Z) e escala dos objetos.
-   **Dropdown**: Seleciona o objeto a ser manipulado.
-   **Botões**: Remove objetos e salva/carrega o estado da cena.
-   **Cliques na Tela**: Adiciona um objeto na cena quando clica em cima dele no canto direito da tela.

## Melhorias possíveis

-   Implementar a mudança de textura dos objetos.
-   Implementar uma interface gráfica mais intuitiva.
-   Melhorar o desempenho da renderização.

## Autora

Fernanda Cardoso Petiz